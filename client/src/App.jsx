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
  const am = a.minutes ?? Number.POSITIVE_INFINITY;
  const bm = b.minutes ?? Number.POSITIVE_INFINITY;
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

export default function App() {
  const [stops, setStops] = useState([]);
  const [selectedStopId, setSelectedStopId] = useState('');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pollRef = useRef(null);

  const selectedStop = useMemo(() => stops.find((s) => s.stopId === selectedStopId) || null, [stops, selectedStopId]);

  const loadStops = useCallback(async () => {
    const res = await fetch('/api/stops');
    if (!res.ok) throw new Error(`Failed to load stops (${res.status})`);
    const json = await res.json();
    const list = Array.isArray(json?.stops) ? json.stops : [];
    setStops(list);
    setSelectedStopId((prev) => prev || list[0]?.stopId || '');
  }, []);

  const loadPredictions = useCallback(async (stopId, { quiet = false } = {}) => {
    setError('');
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/stops/${encodeURIComponent(stopId)}/predictions`);
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

  useEffect(() => {
    loadStops().catch((e) => setError(e?.message || String(e)));
  }, [loadStops]);

  useEffect(() => {
    if (!selectedStopId) return;

    loadPredictions(selectedStopId).catch(() => {});

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadPredictions(selectedStopId, { quiet: true }).catch(() => {});
    }, 15_000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedStopId]);

  const predictions = Array.isArray(payload?.predictions) ? payload.predictions : [];
  const dominantRouteId = normalizeRouteId(getDominantRouteId(predictions)) || 'Blue';
  const dominantColor = getRouteColor(dominantRouteId);
  const byDirection = groupBy(predictions.slice().sort(sortByMinutes), (p) => p.direction || 'Unknown');

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
            onClick={() => selectedStopId && loadPredictions(selectedStopId)}
            disabled={!selectedStopId || loading}
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="content">
        {error ? <div className="error">Error: {error}</div> : null}

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
              <span className="meta-value">{payload?.cached ? 'Cache (10s)' : 'MBTA API'}</span>
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
                          <span className="time-badge">{formatMinutes(p.minutes)}</span>
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
