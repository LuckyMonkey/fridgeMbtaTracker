import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
const DEFAULT_REFRESH_INTERVAL_MS = 20_000;

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

const formatDuration = (deltaMs) => {
  if (!Number.isFinite(deltaMs)) return '—';
  const totalSeconds = Math.max(0, Math.round(deltaMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, '0');
  return `${minutes}m ${paddedSeconds}s`;
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
  const [activeCard, setActiveCard] = useState('inbound');
  const [automationAction, setAutomationAction] = useState({ busy: false, error: '' });

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

  const triggerAutomation = useCallback(
    async (action) => {
      setAutomationAction({ busy: true, error: '' });
      try {
        const res = await fetch('/api/automation/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.details || json?.error || `Request failed (${res.status})`);
        await loadAutomationStatus();
        setAutomationAction({ busy: false, error: '' });
      } catch (err) {
        setAutomationAction({ busy: false, error: err?.message || 'Automation request failed.' });
      }
    },
    [loadAutomationStatus]
  );

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
  const walkMinutesLabel = Number.isInteger(walkTimeMinutes) ? String(walkTimeMinutes) : walkTimeMinutes.toFixed(2);
  const walkBufferMs = walkTimeMinutes * 60_000;
  const lastUpdated = payload?.fetchedAt ? new Date(payload?.fetchedAt).toLocaleTimeString() : '—';

  const matchesHeadsign = (prediction, keyword) => {
    const haystack = `${prediction.headsign || ''} ${prediction.routeName || ''}`.toLowerCase();
    return haystack.includes(keyword.toLowerCase());
  };

  const inboundPredictions = predictionsLive.filter((p) => p.directionId === 1);
  const outboundPredictions = predictionsLive.filter((p) => p.directionId === 0);
  const bowdoinPredictions = predictionsLive.filter((p) => matchesHeadsign(p, 'bowdoin'));
  const wonderlandPredictions = predictionsLive.filter((p) => matchesHeadsign(p, 'wonderland'));
  const primaryPredictions = bowdoinPredictions.length ? bowdoinPredictions : inboundPredictions;
  const secondaryPredictions = wonderlandPredictions.length ? wonderlandPredictions : outboundPredictions;
  const checklist = useMemo(
    () => ({
      inbound: primaryPredictions.some((p) => matchesHeadsign(p, 'bowdoin')),
      outbound: secondaryPredictions.some((p) => matchesHeadsign(p, 'wonderland')),
    }),
    [primaryPredictions, secondaryPredictions]
  );
  const integrityOk = checklist.inbound && checklist.outbound;

  useEffect(() => {
    if (!integrityOk) {
      console.warn('Prediction direction integrity failure', checklist);
    }
  }, [integrityOk, checklist]);

  const walkIndicator = useMemo(() => {
    const sourceCandidates = primaryPredictions;
    const candidates = sourceCandidates
      .map((p) => ({ ...p, eventMs: getPredictionEventMs(p) }))
      .filter((p) => p.eventMs !== null && p.eventMs >= nowMs - 90_000)
      .sort((a, b) => a.eventMs - b.eventMs);

    const accessible = candidates.filter((p) => p.eventMs - nowMs >= walkBufferMs);
    const next = accessible[0] || candidates[0];
    if (!next) return null;

    const eventDeltaMs = next.eventMs - nowMs;
    const leaveDeltaMs = eventDeltaMs - walkBufferMs;
    const headsign = next.headsign || next.routeName || next.routeId || 'Train';

    if (leaveDeltaMs <= 0) {
      return {
        urgency: 'urgent',
        title: 'Leave now',
        subtitle: `${next.direction || 'Train'} · ${headsign} · train in ${formatDuration(eventDeltaMs)}`,
      };
    }

    const minutesThreshold = 60_000;
    if (leaveDeltaMs < minutesThreshold) {
      return {
        urgency: 'soon',
        title: `Leave in ${formatDuration(leaveDeltaMs)}`,
        subtitle: `${next.direction || 'Train'} · ${headsign} · train in ${formatDuration(eventDeltaMs)}`,
      };
    }

    return {
      urgency: 'normal',
      title: `Leave in ${formatDuration(leaveDeltaMs)}`,
      subtitle: `${next.direction || 'Train'} · ${headsign} · train in ${formatDuration(eventDeltaMs)}`,
    };
  }, [primaryPredictions, nowMs, walkBufferMs]);

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
          <p className="subtitle">Inbound focus · Bowdoin bound</p>
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
        {error ? <div className="alert error">Error: {error}</div> : null}
        {automationStatus?.lastActionError ? (
          <div className="alert error">Automation action error: {automationStatus.lastActionError}</div>
        ) : null}

        <section className="status-row">
          <div className="status-block">
            <span className="status-label">Selected stop</span>
            <span className="status-value">{selectedStop ? selectedStop.name : '—'}</span>
          </div>
          <div className="status-block">
            <span className="status-label">Last update</span>
            <span className="status-value">{lastUpdated}</span>
          </div>
        </section>

        {!integrityOk ? (
          <div className="alert check-alert">
            {[
              !checklist.inbound && 'Inbound view no longer shows Bowdoin trains.',
              !checklist.outbound && 'Outbound view no longer shows Wonderland trains.',
            ]
              .filter(Boolean)
              .join(' ')}
          </div>
        ) : null}

        <section className="indicator-row">
          <section className={`panel walk-panel walk-${walkIndicator?.urgency || 'idle'}`}>
            <div className="panel-heading">
              <span className="panel-emoji" role="presentation">
                🚶
              </span>
              <div>
                <p className="panel-label">Bowdoin departure</p>
                <strong className="panel-title">{walkIndicator?.title || 'Waiting for timing'}</strong>
              </div>
            </div>
            <p className="panel-subtitle">{walkIndicator?.subtitle || 'No inbound predictions yet.'}</p>
            <p className="panel-meta">
              Walk buffer: {walkMinutesLabel} min · API refresh {Math.round(refreshIntervalMs / 1000)}s
            </p>
          </section>
        </section>

        <section className="flashcard-wrapper">
          <div className="flashcard-stack">
            <article
              className={`flashcard flashcard--inbound ${activeCard === 'inbound' ? 'flashcard--active' : ''}`}
              aria-hidden={activeCard !== 'inbound'}
            >
              <div className="panel-heading">
                <span className="panel-emoji" role="presentation">
                  ⬆️
                </span>
                <div>
                  <p className="panel-label">Inbound · Bowdoin</p>
                  <strong className="panel-title">
                    {primaryPredictions.length
                      ? `Next ${formatMinutes(primaryPredictions[0].liveMinutes)}`
                      : 'No inbound departures'}
                  </strong>
                </div>
                <button
                  className="flip-button"
                  onClick={() => setActiveCard('outbound')}
                  title="Flip to Wonderland outbound"
                >
                  ↻
                </button>
              </div>
              {primaryPredictions.length ? (
                <div className="list-frame">
                  <ul className="list">
                    {primaryPredictions.slice(0, 8).map((p) => (
                      <li key={p.id} className="row">
                        <div className="row-left">
                          <span className="time-badge">{formatMinutes(p.liveMinutes)}</span>
                          <div className="details">
                            <div className="title">{p.headsign || p.routeName || p.routeId || 'Train'}</div>
                            <div className="sub">{p.status || (p.arrivalTime || p.departureTime ? 'Scheduled' : '—')}</div>
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
                </div>
              ) : (
                <div className="empty primary-empty">Inbound timing settles soon.</div>
              )}
            </article>

            <article
              className={`flashcard flashcard--outbound ${activeCard === 'outbound' ? 'flashcard--active' : ''}`}
              aria-hidden={activeCard !== 'outbound'}
            >
              <div className="panel-heading">
                <span className="panel-emoji" role="presentation">
                  ↩️
                </span>
                <div>
                  <p className="panel-label">Outbound · Wonderland</p>
                  <strong className="panel-title">Outbound timetable</strong>
                </div>
                <button
                  className="flip-button"
                  onClick={() => setActiveCard('inbound')}
                  title="Flip to Bowdoin inbound"
                >
                  ↻
                </button>
              </div>
              {secondaryPredictions.length ? (
                <div className="list-frame">
                  <ul className="list">
                    {secondaryPredictions.slice(0, 10).map((p) => (
                      <li key={p.id} className="row">
                        <div className="row-left">
                          <span className="time-badge">{formatMinutes(p.liveMinutes)}</span>
                          <div className="details">
                            <div className="title">{p.headsign || p.routeName || p.routeId || 'Train'}</div>
                            <div className="sub">{p.status || (p.arrivalTime || p.departureTime ? 'Scheduled' : '—')}</div>
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
                </div>
              ) : (
                <div className="empty secondary-empty">Outbound arrivals show up here once available.</div>
              )}
            </article>
          </div>

        </section>

        <section className="panel volume-panel">
          <div className="panel-heading">
            <span className="panel-emoji" role="presentation">
              🔊
            </span>
            <div>
              <p className="panel-label">Volume boost</p>
              <strong className="panel-title">{automationStateLabel}</strong>
            </div>
          </div>
          <div className="volume-details">
            <div className="detail-line">Next trigger: {nextAutomationLabel}</div>
            <div className="detail-line">
              Status: <span className={`status-chip ${automationStateClass}`}>{automationStateLabel}</span>
            </div>
          </div>
          <div className="volume-actions">
            <button className="action-button" disabled={automationAction.busy} onClick={() => triggerAutomation('raise')}>
              Raise
            </button>
            <button
              className="action-button"
              disabled={automationAction.busy}
              onClick={() => triggerAutomation('restore')}
            >
              Restore
            </button>
          </div>
          {automationAction.error ? <p className="alert inline-alert">{automationAction.error}</p> : null}
        </section>
      </main>
    </div>
  );
}
