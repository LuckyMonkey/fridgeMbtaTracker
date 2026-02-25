const express = require('express');
const cors = require('cors');

const { fetchStopPredictions } = require('./mbta');
const { connectMongo, ensureIndexes, upsertDefaultStop } = require('./store');
const { createVolumeAutomation } = require('./automation');

const toPositiveInt = (value, fallback, min = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.floor(parsed);
};

const PORT = toPositiveInt(process.env.PORT, 4000);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/mbta';
const MBTA_API_KEY = process.env.MBTA_API_KEY || '';

const DEFAULT_STOP_ID = process.env.DEFAULT_STOP_ID || 'place-sdmnl';
const DEFAULT_STOP_NAME = process.env.DEFAULT_STOP_NAME || 'Suffolk Downs';
const WALK_TIME_MINUTES = Number(process.env.WALK_TIME_MINUTES || 4);

const PREDICTIONS_LIMIT = toPositiveInt(process.env.PREDICTIONS_LIMIT, 16, 4);
const PREDICTIONS_TIMEOUT_MS = toPositiveInt(process.env.PREDICTIONS_TIMEOUT_MS, 8000, 3000);
const PREDICTIONS_POLL_MS = toPositiveInt(process.env.PREDICTIONS_POLL_MS, 30_000, 5_000);
const PREDICTIONS_TTL_MS = toPositiveInt(process.env.PREDICTIONS_TTL_MS, 60_000, 5_000);
const PREDICTIONS_STALE_MS = Math.max(
  PREDICTIONS_TTL_MS,
  toPositiveInt(process.env.PREDICTIONS_STALE_MS, 300_000, 10_000)
);
const UI_REFRESH_MS = Math.max(
  PREDICTIONS_TTL_MS,
  toPositiveInt(process.env.UI_REFRESH_MS, 60_000, 10_000)
);

const app = express();
app.use(express.json());
app.use(cors());

let db;
let stopPredictionPoller;
const predictionsCache = new Map();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cacheKeyFor = ({ stopId, routeType, routeId }) =>
  JSON.stringify({
    stopId,
    routeType: Number.isFinite(routeType) ? routeType : 1,
    routeId: routeId ? String(routeId) : '',
  });

const getCacheEntry = (cacheKey) => {
  if (!predictionsCache.has(cacheKey)) {
    predictionsCache.set(cacheKey, {
      payload: null,
      fetchedAtMs: 0,
      expiresAtMs: 0,
      inFlight: null,
      lastError: null,
    });
  }
  return predictionsCache.get(cacheKey);
};

const shouldForceRefresh = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const refreshKey = async (
  { stopId, routeType = 1, routeId = '', limit = PREDICTIONS_LIMIT, apiKey = MBTA_API_KEY },
  { reason = 'poll' } = {}
) => {
  const cacheKey = cacheKeyFor({ stopId, routeType, routeId });
  const entry = getCacheEntry(cacheKey);
  if (entry.inFlight) {
    return entry.inFlight;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREDICTIONS_TIMEOUT_MS);

  const fetchPromise = (async () => {
    try {
      const payload = await fetchStopPredictions({
        stopId,
        routeType,
        routeId,
        limit,
        apiKey,
        signal: controller.signal,
      });

      const fetchedAtMs = Date.now();
      entry.payload = payload;
      entry.fetchedAtMs = fetchedAtMs;
      entry.expiresAtMs = fetchedAtMs + PREDICTIONS_TTL_MS;
      entry.lastError = null;

      await insertFetchAudit({
        stopId,
        routeType,
        routeId,
        count: Array.isArray(payload.predictions) ? payload.predictions.length : 0,
        source: 'mbta-api',
      });

      return payload;
    } finally {
      clearTimeout(timeout);
    }
  })();

  entry.inFlight = fetchPromise
    .catch((err) => {
      entry.lastError = { message: err?.message || String(err), timestamp: Date.now() };
      throw err;
    })
    .finally(() => {
      entry.inFlight = null;
    });

  return entry.inFlight;
};

const insertFetchAudit = async ({ stopId, routeType, routeId, count, source }) => {
  if (!db) return;
  try {
    await db.collection('fetches').insertOne({
      stopId,
      routeType,
      routeId: routeId || null,
      fetchedAt: new Date(),
      count,
      source,
    });
  } catch (err) {
    console.error('Unable to record fetch audit', err);
  }
};

const POLL_STAGGER_MS = 350;

const pollPinnedStops = async () => {
  if (!db) return;
  const stops = await db
    .collection('stops')
    .find({ pinned: true })
    .project({ _id: 0, stopId: 1 })
    .sort({ createdAt: 1 })
    .toArray();

  for (const stop of stops) {
    try {
      await refreshKey(
        {
          stopId: stop.stopId,
          routeType: 1,
          routeId: '',
          limit: PREDICTIONS_LIMIT,
        },
        { reason: 'poll' }
      );
    } catch (err) {
      console.warn('Prediction poll failed', stop.stopId, err?.message || err);
    }
    await wait(POLL_STAGGER_MS);
  }
};

const startPredictionPoller = () => {
  let stopped = false;

  const cycle = async () => {
    if (stopped) return;
    const start = Date.now();
    try {
      await pollPinnedStops();
    } catch (err) {
      console.error('Prediction polling error', err);
    }
    if (stopped) return;
    const duration = Date.now() - start;
    const delayMs = Math.max(0, PREDICTIONS_POLL_MS - duration);
    setTimeout(cycle, delayMs);
  };

  cycle();

  return () => {
    stopped = true;
  };
};

const getPredictionsCached = async ({
  stopId,
  routeType = 1,
  routeId = '',
  limit = PREDICTIONS_LIMIT,
  forceRefresh = false,
  allowStale = true,
  apiKey = MBTA_API_KEY,
}) => {
  const sanitizedStopId = String(stopId || '').trim();
  const normalizedRouteType = Number.isFinite(routeType) ? routeType : 1;
  const normalizedRouteId = routeId ? String(routeId).trim() : '';
  const cacheKey = cacheKeyFor({
    stopId: sanitizedStopId,
    routeType: normalizedRouteType,
    routeId: normalizedRouteId,
  });
  const entry = getCacheEntry(cacheKey);
  const now = Date.now();

  const hasFreshPayload = entry.payload && entry.expiresAtMs > now;
  const withinStaleWindow = entry.payload && now - entry.fetchedAtMs <= PREDICTIONS_STALE_MS;

  if (!forceRefresh) {
    if (hasFreshPayload) {
      return {
        payload: entry.payload,
        cache: { cached: true, stale: false, source: 'memory-cache' },
      };
    }

    if (allowStale && withinStaleWindow) {
      return {
        payload: entry.payload,
        cache: {
          cached: true,
          stale: true,
          source: 'memory-cache',
          error: entry.lastError?.message || null,
        },
      };
    }
  }

  const needsFetch = forceRefresh || !entry.payload || now - entry.fetchedAtMs > PREDICTIONS_STALE_MS;

  if (needsFetch) {
    try {
      const payload = await refreshKey(
        {
          stopId: sanitizedStopId,
          routeType: normalizedRouteType,
          routeId: normalizedRouteId,
          limit,
          apiKey,
        },
        { reason: forceRefresh ? 'force' : 'request' }
      );
      return {
        payload,
        cache: { cached: false, stale: false, source: 'mbta-api' },
      };
    } catch (err) {
      if (entry.payload && allowStale && now - entry.fetchedAtMs <= PREDICTIONS_STALE_MS) {
        return {
          payload: entry.payload,
          cache: {
            cached: true,
            stale: true,
            source: 'stale-cache',
            error: `MBTA fetch failed: ${err?.message || String(err)}`,
          },
        };
      }
      throw err;
    }
  }

  if (entry.payload) {
    return {
      payload: entry.payload,
      cache: {
        cached: true,
        stale: true,
        source: 'memory-cache',
        error: entry.lastError?.message || null,
      },
    };
  }

  throw new Error('No cached payload available');
};

const volumeAutomation = createVolumeAutomation({
  enabled: process.env.AUTOMATION_ENABLED,
  pollMs: process.env.AUTOMATION_POLL_MS,
  stopId: process.env.AUTOMATION_STOP_ID || 'place-orhte',
  stopName: process.env.AUTOMATION_STOP_NAME || 'Orient Heights',
  routeType: process.env.AUTOMATION_ROUTE_TYPE || 1,
  routeId: process.env.AUTOMATION_ROUTE_ID || 'Blue',
  leadMinutes: process.env.AUTOMATION_LEAD_MINUTES || 1.15,
  passSeconds: process.env.AUTOMATION_PASS_SECONDS || 90,
  limit: process.env.AUTOMATION_LIMIT || 14,
  webhookUrl: process.env.AUTOMATION_WEBHOOK_URL || '',
  webhookToken: process.env.AUTOMATION_WEBHOOK_TOKEN || '',
  raiseCommand: process.env.AUTOMATION_RAISE_COMMAND || '',
  restoreCommand: process.env.AUTOMATION_RESTORE_COMMAND || '',
  apiKey: MBTA_API_KEY,
  fetchPredictions: async ({ stopId, routeType, routeId, limit, apiKey }) => {
    const result = await getPredictionsCached({
      stopId,
      routeType,
      routeId,
      limit,
      forceRefresh: false,
      allowStale: true,
      apiKey,
    });
    return result.payload;
  },
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'mbta-tracker-api',
    cache: {
      freshMs: PREDICTIONS_TTL_MS,
      staleMs: PREDICTIONS_STALE_MS,
      timeoutMs: PREDICTIONS_TIMEOUT_MS,
    },
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    walkTimeMinutes: Number.isFinite(WALK_TIME_MINUTES) && WALK_TIME_MINUTES > 0 ? WALK_TIME_MINUTES : 4,
    defaultStopId: DEFAULT_STOP_ID,
    defaultStopName: DEFAULT_STOP_NAME,
    refreshIntervalMs: UI_REFRESH_MS,
    cacheFreshMs: PREDICTIONS_TTL_MS,
    cacheTtlMs: PREDICTIONS_TTL_MS,
    pollIntervalMs: PREDICTIONS_POLL_MS,
    cacheStaleMs: PREDICTIONS_STALE_MS,
  });
});

app.get('/api/stops', async (_req, res) => {
  const stops = await db
    .collection('stops')
    .find({ pinned: true })
    .project({ _id: 0 })
    .sort({ createdAt: 1 })
    .toArray();
  res.json({ stops });
});

app.post('/api/stops', async (req, res) => {
  const { stopId, name } = req.body || {};
  if (!stopId || typeof stopId !== 'string') {
    return res.status(400).json({ error: 'stopId is required' });
  }

  const doc = {
    stopId: stopId.trim(),
    name: (name && String(name).trim()) || stopId.trim(),
    pinned: true,
    createdAt: new Date(),
  };

  await db.collection('stops').updateOne({ stopId: doc.stopId }, { $set: doc }, { upsert: true });
  return res.status(201).json({ stop: { stopId: doc.stopId, name: doc.name, pinned: true } });
});

app.delete('/api/stops/:stopId', async (req, res) => {
  const stopId = String(req.params.stopId || '').trim();
  if (!stopId) return res.status(400).json({ error: 'stopId is required' });
  await db.collection('stops').deleteOne({ stopId });
  return res.status(204).send();
});

app.get('/api/stops/:stopId/predictions', async (req, res) => {
  const stopId = String(req.params.stopId || '').trim();
  const routeType = req.query.routeType !== undefined ? Number(req.query.routeType) : 1;
  const routeId = req.query.routeId ? String(req.query.routeId).trim() : '';
  const forceRefresh = shouldForceRefresh(req.query.refresh);

  if (!stopId) return res.status(400).json({ error: 'stopId is required' });
  if (routeType !== undefined && Number.isNaN(routeType)) {
    return res.status(400).json({ error: 'routeType must be a number' });
  }

  try {
    const result = await getPredictionsCached({
      stopId,
      routeType,
      routeId,
      forceRefresh,
      allowStale: true,
      limit: PREDICTIONS_LIMIT,
      apiKey: MBTA_API_KEY,
    });

    return res.json({
      ...result.payload,
      ...result.cache,
    });
  } catch (err) {
    const status = err?.status || 502;
    return res.status(status).json({
      error: 'Failed to fetch predictions',
      details: err?.message || String(err),
      url: err?.url,
    });
  }
});

app.get('/api/suffolk-downs', async (_req, res) => {
  const url = `/api/stops/${encodeURIComponent(DEFAULT_STOP_ID)}/predictions`;
  res.redirect(302, url);
});

app.get('/api/automation/status', (_req, res) => {
  res.json(volumeAutomation.getStatus());
});

app.post('/api/automation/test', async (req, res) => {
  const action = String(req.body?.action || 'raise').trim().toLowerCase();
  try {
    const status = await volumeAutomation.triggerManual(action);
    return res.status(202).json({ ok: true, status });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || String(err) });
  }
});

const start = async () => {
  const mongo = await connectMongo(MONGO_URL);
  db = mongo.db;
  await ensureIndexes(db);
  await upsertDefaultStop(db, { stopId: DEFAULT_STOP_ID, name: DEFAULT_STOP_NAME });
  volumeAutomation.start();
  stopPredictionPoller = startPredictionPoller();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MBTA API listening on :${PORT}`);
  });
};

start().catch((err) => {
  console.error('Startup failed', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  volumeAutomation.stop();
  stopPredictionPoller?.();
});

process.on('SIGINT', () => {
  volumeAutomation.stop();
  stopPredictionPoller?.();
});
