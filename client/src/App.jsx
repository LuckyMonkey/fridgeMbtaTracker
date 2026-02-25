import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const groupBy = (items, keyFn) => {
  const out = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const arr = out.get(key) || [];
    arr.push(item);
    out.set(key, arr);
  }
  return out;
};

const formatMinutes = (minutes) => {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes <= 0) return 'Now';
  return `${minutes} min`;
};

const sortByMinutes = (a, b) => {
  const am = a ?? Number.POSITIVE_INFINITY;
  const bm = b ?? Number.POSITIVE_INFINITY;
  return am - bm;
};

const ROUTE_COLORS = {
  Blue: '#003DA5',
  Red: '#DA291C',
  Orange: '#ED8B00',
  Green: '#00843D',
  Mattapan: '#DA291C',
};

const normalizeRouteId = (routeId) => {
  if (!routeId) return '';
  const value = String(routeId).trim();
  if (!value) return '';
  if (value.startsWith('Green-')) return 'Green';
  return value;
};

const getRouteColor = (routeId) => ROUTE_COLORS[normalizeRouteId(routeId)] || '#1f2937';

const getDominantRouteId = (predictions) => {
  const counts = new Map();
  for (const p of predictions) {
    const id = p.routeId || '';
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [id, count] of counts.entries()) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
};

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_WALK_TIME_MINUTES = toPositiveNumber(import.meta.env.VITE_WALK_MINUTES, 4);
const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

const getPredictionEventMs = (prediction) => {
  const iso = prediction?.arrivalTime || prediction?.departureTime;
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

const getLiveMinutes = (prediction, nowMs) => {
  const eventMs = getPredictionEventMs(prediction);
  if (!Number.isFinite(eventMs)) return prediction?.minutes ?? null;
  return Math.ceil((eventMs - nowMs) / 60_000);
};

const formatRelative = (deltaMs) => {
  if (!Number.isFinite(deltaMs)) return '—';
  if (deltaMs <= 0) return 'now';
  if (deltaMs < 60_000) return '<1 min';
  return `${Math.ceil(deltaMs / 60_000)} min`;
};

const isBowdoinDestination = (prediction) => {
  const label = (prediction.headsign || prediction.routeName || prediction.routeId || '').toLowerCase();
  return label.includes('bowdoin');
};

export default function App() {
  const [stops, setStops] = useState([]);
  const [selectedStopId, setSelectedStopId] = useState('');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [walkTimeMinutes, setWalkTimeMinutes] = useState(DEFAULT_WALK_TIME_MINUTES);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(DEFAULT_REFRESH_INTERVAL_MS);
  const [automationStatus, setAutomationStatus] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const pollRef = useRef(null);
  const automationPollRef = useRef(null);

  const selectedStop = useMemo(() => stops.find((s) => s.stopId === selectedStopId) || null, [stops, selectedStopId]);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) return;
      const json = await res.json();
      setWalkTimeMinutes((prev) => toPositiveNumber(json?.walkTimeMinutes, prev));
      setRefreshIntervalMs((prev) => toPositiveNumber(json?.refreshIntervalMs, prev));
    } catch (_err) {
      // Keep defaults if config endpoint is unavailable.
    }
  }, []);

  const loadStops = useCallback(async () => {
    const res = await fetch('/api/stops');
    if (!res.ok) throw new Error(`Failed to load stops (${res.status})`);
    const json = await res.json();
    const list = Array.isArray(json?.stops) ? json.stops : [];
    setStops(list);
    setSelectedStopId((prev) => prev || list[0]?.stopId || '');
  }, []);

  const loadPredictions = useCallback(async (stopId, { quiet = false, force = false } = {}) => {
    setError('');
    if (!quiet) setLoading(true);
    try {
      const refreshQuery = force ? '?refresh=1' : '';
      const res = await fetch(`/api/stops/${encodeURIComponent(stopId)}/predictions${refreshQuery}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.details || json?.error || `Request failed (${res.status})`);
      setPayload(json);
    } catch (e) {
      setError(e?.message || String(e));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAutomationStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/automation/status');
      if (!res.ok) return;
      const json = await res.json();
      setAutomationStatus(json);
    } catch (_err) {
      // Ignore transient status errors.
    }
  }, []);

  useEffect(() => {
    loadConfig().catch(() => {});
  }, [loadConfig]);

  useEffect(() => {
    loadStops().catch((e) => setError(e?.message || String(e)));
  }, [loadStops]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedStopId) return;

    loadPredictions(selectedStopId).catch(() => {});

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadPredictions(selectedStopId, { quiet: true }).catch(() => {});
    }, refreshIntervalMs);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedStopId, loadPredictions, refreshIntervalMs]);

  useEffect(() => {
    loadAutomationStatus().catch(() => {});
    if (automationPollRef.current) clearInterval(automationPollRef.current);
    automationPollRef.current = setInterval(() => {
      loadAutomationStatus().catch(() => {});
    }, 30_000);

    return () => {
      if (automationPollRef.current) clearInterval(automationPollRef.current);
    };
  }, [loadAutomationStatus]);

  const predictions = Array.isArray(payload?.predictions) ? payload.predictions : [];
  const predictionsLive = useMemo(
    () =>
      predictions
        .map((prediction) => ({ ...prediction, liveMinutes: getLiveMinutes(prediction, nowMs) }))
        .sort((a, b) => sortByMinutes(a.liveMinutes, b.liveMinutes)),
    [predictions, nowMs]
  );
  const dominantRouteId = normalizeRouteId(getDominantRouteId(predictionsLive)) || 'Blue';
  const dominantColor = getRouteColor(dominantRouteId);
  const byDirection = groupBy(predictionsLive, (p) => p.direction || 'Unknown');
  const walkMinutesLabel = Number.isInteger(walkTimeMinutes) ? String(walkTimeMinutes) : walkTimeMinutes.toFixed(2);
  const walkBufferMs = walkTimeMinutes * 60_000;
  const sourceLabel = payload?.stale
    ? 'Stale cache fallback'
    : payload?.cached
      ? `Local cache (${Math.round((payload?.cacheFreshMs || 0) / 1000)}s)`
      : payload
        ? 'MBTA API'
        : '—';

  const walkIndicator = useMemo(() => {
    const candidates = predictions
      .map((p) => ({ ...p, eventMs: getPredictionEventMs(p) }))
      .filter(
        (p) => p.directionId === 1 && isBowdoinDestination(p) && p.eventMs !== null && p.eventMs >= nowMs - 90_000
      )
      .sort((a, b) => a.eventMs - b.eventMs);

    const next = candidates[0];
    if (!next) return null;

    const eventDeltaMs = next.eventMs - nowMs;
    const leaveDeltaMs = eventDeltaMs - walkBufferMs;
    const headsign = next.headsign || next.routeName || next.routeId || 'Train';

    if (leaveDeltaMs <= 0) {
      return {
        urgency: 'urgent',
        title: 'Leave now',
        subtitle: `${next.direction || 'Train'} · ${headsign} · train in ${formatRelative(eventDeltaMs)}`,
      };
    }

    if (leaveDeltaMs < 60_000) {
      return {
        urgency: 'soon',
        title: 'Leave in <1 min',
        subtitle: `${next.direction || 'Train'} · ${headsign} · train in ${formatRelative(eventDeltaMs)}`,
      };
    }

    return {
      urgency: 'normal',
      title: `Leave in ${Math.ceil(leaveDeltaMs / 60_000)} min`,
      subtitle: `${next.direction || 'Train'} · ${headsign} · train in ${formatRelative(eventDeltaMs)}`,
    };
  }, [predictions, nowMs, walkBufferMs]);

  const automationStateLabel = !automationStatus?.enabled ? 'Disabled' : automationStatus.active ? 'Active' : 'Armed';
  const automationStateClass = !automationStatus?.enabled ? 'status-off' : automationStatus.active ? 'status-active' : 'status-armed';
  const nextAutomationWindow = automationStatus?.nextWindow || null;
  const nextAutomationLabel = (() => {
    if (!nextAutomationWindow?.startAt) return '—';
    const modeLabel =
      nextAutomationWindow.mode === 'outbound_arrival' ? 'Wonderland approach' : 'Bowdoin post-departure';
    const deltaMs = Date.parse(nextAutomationWindow.startAt) - nowMs;
    const when = formatRelative(deltaMs);
    return when === '—' ? '—' : `${modeLabel} in ${when}`;
  })();

  return (
    <div className="page" style={{ '--mbta-accent': dominantColor }}>
      <header className="header">
        <div className="brand">
          <div className="line-badge" aria-hidden="true">
            <span className="line-dot" />
            <span className="line-name">{dominantRouteId}</span>
          </div>
          <h1>MBTA Tracker</h1>
          <p className="subtitle">Arrivals and departures for your pinned stops</p>
        </div>

        <div className="controls">
          <label className="control">
            <span>Stop</span>
            <select value={selectedStopId} onChange={(e) => setSelectedStopId(e.target.value)}>
              {stops.map((s) => (
                <option key={s.stopId} value={s.stopId}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="button"
            onClick={() => selectedStopId && loadPredictions(selectedStopId, { force: true })}
            disabled={!selectedStopId || loading}
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="content">
        {error ? <div className="error">Error: {error}</div> : null}
        {automationStatus?.lastActionError ? (
          <div className="error">Automation action error: {automationStatus.lastActionError}</div>
        ) : null}

        <section className={`walk-indicator walk-${walkIndicator?.urgency || 'idle'}`}>
          <span className="walk-label">Walk buffer: {walkMinutesLabel} min</span>
          <strong className="walk-title">{walkIndicator?.title || 'Waiting for train timing'}</strong>
          <span className="walk-sub">{walkIndicator?.subtitle || 'No upcoming prediction right now.'}</span>
        </section>

        <section className="meta">
          <div className="meta-row">
            <div className="meta-item">
              <span className="meta-label">Selected</span>
              <span className="meta-value">{selectedStop ? selectedStop.name : '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Updated</span>
              <span className="meta-value">{payload?.fetchedAt ? new Date(payload.fetchedAt).toLocaleTimeString() : '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Source</span>
              <span className="meta-value">{sourceLabel}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">API refresh</span>
              <span className="meta-value">Every {Math.round(refreshIntervalMs / 1000)}s</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Clock</span>
              <span className="meta-value">{new Date(nowMs).toLocaleTimeString()}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Volume boost</span>
              <span className={`meta-value status-chip ${automationStateClass}`}>{automationStateLabel}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Next volume trigger</span>
              <span className="meta-value">{nextAutomationLabel}</span>
            </div>
          </div>
        </section>

        <div className="grid">
          {Array.from(byDirection.entries()).map(([direction, items]) => {
            const panelRouteId = normalizeRouteId(getDominantRouteId(items)) || dominantRouteId;
            const panelColor = getRouteColor(panelRouteId);
            return (
            <section key={direction} className="panel" style={{ '--panel-accent': panelColor }}>
              <h2>{direction}</h2>
              {items.length ? (
                <ul className="list">
                  {items.slice(0, 8).map((p) => (
                    <li key={p.id} className="row">
                      <div className="row-left">
                        <div className="time">
                          <span className="time-badge">{formatMinutes(p.liveMinutes)}</span>
                        </div>
                        <div className="details">
                          <div className="title">{p.headsign || p.routeName || p.routeId || 'Train'}</div>
                          <div className="sub">
                            {p.status ? p.status : p.arrivalTime || p.departureTime ? 'Scheduled' : '—'}
                          </div>
                        </div>
                      </div>
                      <div className="row-right">
                        {p.routeId ? (
                          <span className="route-pill" style={{ '--route-color': getRouteColor(p.routeId) }}>
                            {p.routeId}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty">No predictions available.</div>
              )}
            </section>
          )})}

          {!predictions.length && !error ? (
            <section className="panel">
              <h2>Predictions</h2>
              <div className="empty">{loading ? 'Loading…' : 'No data yet.'}</div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
