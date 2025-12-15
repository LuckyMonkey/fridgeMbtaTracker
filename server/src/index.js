const express = require('express');
const cors = require('cors');

const { fetchStopPredictions } = require('./mbta');
const { connectMongo, ensureIndexes, upsertDefaultStop } = require('./store');

const PORT = Number(process.env.PORT || 4000);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/mbta';
const MBTA_API_KEY = process.env.MBTA_API_KEY || '';

const DEFAULT_STOP_ID = process.env.DEFAULT_STOP_ID || 'place-sdmnl';
const DEFAULT_STOP_NAME = process.env.DEFAULT_STOP_NAME || 'Suffolk Downs';

const app = express();
app.use(express.json());
app.use(cors());

let db;
let predictionsCache = { key: '', expiresAt: 0, payload: null };

const cacheKeyFor = ({ stopId, routeType, routeId }) =>
  JSON.stringify({ stopId, routeType: routeType ?? null, routeId: routeId ?? null });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mbta-tracker-api' });
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

  if (!stopId) return res.status(400).json({ error: 'stopId is required' });
  if (routeType !== undefined && Number.isNaN(routeType)) {
    return res.status(400).json({ error: 'routeType must be a number' });
  }

  const cacheKey = cacheKeyFor({ stopId, routeType, routeId });
  const now = Date.now();
  if (predictionsCache.payload && predictionsCache.key === cacheKey && predictionsCache.expiresAt > now) {
    return res.json({ ...predictionsCache.payload, cached: true });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const payload = await fetchStopPredictions({
      stopId,
      apiKey: MBTA_API_KEY,
      routeType,
      routeId,
      limit: 16,
      signal: controller.signal,
    });

    await db.collection('fetches').insertOne({
      stopId,
      routeType,
      routeId: routeId || null,
      fetchedAt: new Date(),
      count: payload.predictions.length,
    });

    predictionsCache = { key: cacheKey, expiresAt: now + 10_000, payload };
    return res.json({ ...payload, cached: false });
  } catch (err) {
    const status = err?.status || 502;
    return res.status(status).json({
      error: 'Failed to fetch predictions',
      details: err?.message || String(err),
      url: err?.url,
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.get('/api/suffolk-downs', async (_req, res) => {
  const url = `/api/stops/${encodeURIComponent(DEFAULT_STOP_ID)}/predictions`;
  res.redirect(302, url);
});

const start = async () => {
  const mongo = await connectMongo(MONGO_URL);
  db = mongo.db;
  await ensureIndexes(db);
  await upsertDefaultStop(db, { stopId: DEFAULT_STOP_ID, name: DEFAULT_STOP_NAME });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MBTA API listening on :${PORT}`);
  });
};

start().catch((err) => {
  console.error('Startup failed', err);
  process.exit(1);
});

