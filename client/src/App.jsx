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
const MIN_MISS_MS = 3 * 60_000;

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

const LANG_COOKIE = 'mbta-lang';
const DEFAULT_LANGUAGE = 'es';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const readLanguageCookie = () => {
  if (typeof document === 'undefined') return null;
  return document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${LANG_COOKIE}=`))
    ?.split('=')[1];
};

const writeLanguageCookie = (value) => {
  if (typeof document === 'undefined') return;
  if (!value) {
    document.cookie = `${LANG_COOKIE}=;max-age=0;path=/`;
    return;
  }
  document.cookie = `${LANG_COOKIE}=${value};max-age=${COOKIE_MAX_AGE_SECONDS};path=/`;
};

const TRANSLATIONS = {
  en: {
    brandTitle: 'MBTA Tracker',
    subtitle: 'Inbound focus · Bowdoin bound',
    controls: {
      stop: 'Stop',
      refresh: 'Refresh',
      languageLabel: 'Language',
      switchToEnglish: 'Switch to English',
      switchToSpanish: 'Switch to Spanish',
    },
    status: {
      selected: 'Selected stop',
      updated: 'Last update',
    },
    alerts: {
      error: 'Error',
      automation: 'Automation action error',
      inboundIntegrity: 'Inbound view no longer shows Bowdoin trains.',
      outboundIntegrity: 'Outbound view no longer shows Wonderland trains.',
    },
    walk: {
      label: 'Bowdoin departure',
      idleTitle: 'Waiting for timing',
      idleSubtitle: 'No inbound predictions yet.',
      trainIn: 'train in',
      leaveNow: 'Leave now',
      leaveSoon: 'Leave in',
      walkBufferText: (walkMinutes, refreshSeconds) => `Walk buffer: ${walkMinutes} min · API refresh ${refreshSeconds}s`,
    },
    flashcards: {
      inboundLabel: 'Inbound · Bowdoin',
      inboundNextPrefix: 'Next',
      noDepartures: 'No inbound departures',
      outboundLabel: 'Outbound · Wonderland',
      outboundTitle: 'Outbound timetable',
      outboundEmpty: 'Outbound arrivals show up here once available.',
      primaryEmpty: 'Inbound timing settles soon.',
      flipToOutboundTitle: 'Flip to Wonderland outbound',
      flipToInboundTitle: 'Flip to Bowdoin inbound',
      missedSuffix: ' (missed)',
    },
    volumePanel: {
      label: 'Volume boost',
      statusLabel: 'Status',
      nextTriggerLabel: 'Next trigger',
      raise: 'Raise',
      restore: 'Restore',
    },
    automation: {
      modes: {
        outbound_arrival: 'Wonderland approach',
        inbound_departure: 'Bowdoin post-departure',
      },
      statuses: {
        disabled: 'Disabled',
        active: 'Active',
        armed: 'Armed',
      },
      upcomingIn: 'in',
    },
  },
  es: {
    brandTitle: 'MBTA Tracker',
    subtitle: 'Enfoque entrante · rumbo a Bowdoin',
    controls: {
      stop: 'Parada',
      refresh: 'Actualizar',
      languageLabel: 'Idioma',
      switchToEnglish: 'Cambiar a inglés',
      switchToSpanish: 'Cambiar a español',
    },
    status: {
      selected: 'Parada seleccionada',
      updated: 'Última actualización',
    },
    alerts: {
      error: 'Error',
      automation: 'Error de automatización',
      inboundIntegrity: 'La vista entrante ya no muestra trenes a Bowdoin.',
      outboundIntegrity: 'La vista saliente ya no muestra trenes a Wonderland.',
    },
    walk: {
      label: 'Salida a Bowdoin',
      idleTitle: 'Esperando tiempos',
      idleSubtitle: 'Aún no hay predicciones entrantes.',
      trainIn: 'tren en',
      leaveNow: 'Sal ahora',
      leaveSoon: 'Sal en',
      walkBufferText: (walkMinutes, refreshSeconds) =>
        `Buffer de caminata: ${walkMinutes} min · actualización API cada ${refreshSeconds}s`,
    },
    flashcards: {
      inboundLabel: 'Entrante · Bowdoin',
      inboundNextPrefix: 'Siguiente',
      noDepartures: 'Sin salidas entrantes',
      outboundLabel: 'Saliente · Wonderland',
      outboundTitle: 'Programa de salida',
      outboundEmpty: 'Las salidas a Wonderland aparecen aquí cuando haya datos.',
      primaryEmpty: 'Los tiempos entrantes llegan pronto.',
      flipToOutboundTitle: 'Mostrar salidas a Wonderland',
      flipToInboundTitle: 'Mostrar salidas a Bowdoin',
      missedSuffix: ' (perdido)',
    },
    volumePanel: {
      label: 'Aumento de volumen',
      statusLabel: 'Estado',
      nextTriggerLabel: 'Próximo disparo',
      raise: 'Subir',
      restore: 'Restaurar',
    },
    automation: {
      modes: {
        outbound_arrival: 'Aproximación a Wonderland',
        inbound_departure: 'Salida de Bowdoin',
      },
      statuses: {
        disabled: 'Desactivado',
        active: 'Activo',
        armed: 'Preparado',
      },
      upcomingIn: 'en',
    },
  },
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
  const [language, setLanguage] = useState(() => readLanguageCookie() || DEFAULT_LANGUAGE);

  const pollRef = useRef(null);
  const automationPollRef = useRef(null);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => {
      const nextLang = prev === 'es' ? 'en' : 'es';
      if (nextLang === 'en') {
        writeLanguageCookie('en');
      } else {
        writeLanguageCookie('');
      }
      return nextLang;
    });
  }, []);

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
  const annotatePredictions = useCallback(
    (list) =>
      list.map((prediction) => {
        const eventMs = getPredictionEventMs(prediction);
        const eventDeltaMs = Number.isFinite(eventMs) ? eventMs - nowMs : null;
        const isMissed = eventDeltaMs !== null && eventDeltaMs < MIN_MISS_MS;
        const isCatchable = eventDeltaMs !== null && eventDeltaMs >= walkBufferMs;
        return { ...prediction, eventMs, eventDeltaMs, isMissed, isCatchable };
      }),
    [nowMs, walkBufferMs]
  );
  const annotatedPrimary = useMemo(() => annotatePredictions(primaryPredictions), [annotatePredictions, primaryPredictions]);
  const annotatedSecondary = useMemo(() => annotatePredictions(secondaryPredictions), [annotatePredictions, secondaryPredictions]);
  const checklist = useMemo(
    () => ({
      inbound: annotatedPrimary.some((p) => matchesHeadsign(p, 'bowdoin')),
      outbound: annotatedSecondary.some((p) => matchesHeadsign(p, 'wonderland')),
    }),
    [annotatedPrimary, annotatedSecondary]
  );
  const integrityOk = checklist.inbound && checklist.outbound;
  const nextAccessibleId = annotatedPrimary.find((p) => p.isCatchable)?.id || null;
  const languageText = TRANSLATIONS[language] || TRANSLATIONS[DEFAULT_LANGUAGE];

  useEffect(() => {
    if (!integrityOk) {
      console.warn('Prediction direction integrity failure', checklist);
    }
  }, [integrityOk, checklist]);

  const walkIndicator = useMemo(() => {
    const text = TRANSLATIONS[language] || TRANSLATIONS[DEFAULT_LANGUAGE];
    const candidates = annotatedPrimary.filter((p) => p.eventMs !== null);
    const accessible = candidates.filter((p) => p.isCatchable);
    const next = accessible[0] || candidates[0];
    if (!next || next.eventDeltaMs === null) return null;

    const eventDeltaMs = next.eventDeltaMs;
    const leaveDeltaMs = eventDeltaMs - walkBufferMs;
    const headsign = next.headsign || next.routeName || next.routeId || 'Train';
    const directionLabel = next.direction || 'Train';

    if (leaveDeltaMs <= 0) {
      return {
        urgency: 'urgent',
        title: text.walk.leaveNow,
        subtitle: `${directionLabel} · ${headsign} · ${text.walk.trainIn} ${formatDuration(eventDeltaMs)}`,
      };
    }

    if (leaveDeltaMs < MIN_MISS_MS) {
      return {
        urgency: 'soon',
        title: `${text.walk.leaveSoon} ${formatDuration(leaveDeltaMs)}`,
        subtitle: `${directionLabel} · ${headsign} · ${text.walk.trainIn} ${formatDuration(eventDeltaMs)}`,
      };
    }

    return {
      urgency: 'normal',
      title: `${text.walk.leaveSoon} ${formatDuration(leaveDeltaMs)}`,
      subtitle: `${directionLabel} · ${headsign} · ${text.walk.trainIn} ${formatDuration(eventDeltaMs)}`,
    };
  }, [annotatedPrimary, language, nowMs, walkBufferMs]);

  const automationStateKey = !automationStatus?.enabled ? 'disabled' : automationStatus.active ? 'active' : 'armed';
  const automationStateLabel = languageText.automation.statuses[automationStateKey] || languageText.automation.statuses.disabled;
  const automationStateClass = `status-${automationStateKey}`;
  const nextAutomationWindow = automationStatus?.nextWindow || null;
  const nextAutomationLabel = (() => {
    if (!nextAutomationWindow?.startAt) return '—';
    const modeLabel =
      languageText.automation.modes[nextAutomationWindow.mode] ||
      (nextAutomationWindow.mode === 'outbound_arrival'
        ? 'Wonderland approach'
        : nextAutomationWindow.mode === 'inbound_departure'
        ? 'Bowdoin post-departure'
        : nextAutomationWindow.mode || 'Event');
    const deltaMs = Date.parse(nextAutomationWindow.startAt) - nowMs;
    const when = formatRelative(deltaMs);
    return when === '—'
      ? '—'
      : `${modeLabel} ${languageText.automation.upcomingIn} ${when}`;
  })();

  return (
    <div className="page" style={{ '--mbta-accent': dominantColor }}>
      <header className="header">
        <div className="brand">
          <div className="line-badge" aria-hidden="true">
            <span className="line-dot" />
            <span className="line-name">{dominantRouteId}</span>
          </div>
          <h1>{languageText.brandTitle}</h1>
          <p className="subtitle">{languageText.subtitle}</p>
        </div>

        <div className="controls">
          <label className="control">
            <span>{languageText.controls.stop}</span>
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
            {languageText.controls.refresh}
          </button>

          <div className="language-control">
            <span>{languageText.controls.languageLabel}</span>
            <button className="lang-toggle" type="button" onClick={toggleLanguage} aria-pressed={language === 'en'}>
              {language === 'es' ? languageText.controls.switchToEnglish : languageText.controls.switchToSpanish}
            </button>
          </div>
        </div>
      </header>

      <main className="content">
        {error ? (
          <div className="alert error">
            {languageText.alerts.error}: {error}
          </div>
        ) : null}
        {automationStatus?.lastActionError ? (
          <div className="alert error">
            {languageText.alerts.automation}: {automationStatus.lastActionError}
          </div>
        ) : null}

        <section className="status-row">
          <div className="status-block">
            <span className="status-label">{languageText.status.selected}</span>
            <span className="status-value">{selectedStop ? selectedStop.name : '—'}</span>
          </div>
          <div className="status-block">
            <span className="status-label">{languageText.status.updated}</span>
            <span className="status-value">{lastUpdated}</span>
          </div>
        </section>

        {!integrityOk ? (
          <div className="alert check-alert">
            {[
              !checklist.inbound && languageText.alerts.inboundIntegrity,
              !checklist.outbound && languageText.alerts.outboundIntegrity,
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
                <p className="panel-label">{languageText.walk.label}</p>
                <strong className="panel-title">
                  {walkIndicator?.title || languageText.walk.idleTitle}
                </strong>
              </div>
            </div>
            <p className="panel-subtitle">
              {walkIndicator?.subtitle || languageText.walk.idleSubtitle}
            </p>
            <p className="panel-meta">
              {languageText.walk.walkBufferText(walkMinutesLabel, Math.round(refreshIntervalMs / 1000))}
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
                <p className="panel-label">{languageText.flashcards.inboundLabel}</p>
                <strong className="panel-title">
                  {annotatedPrimary.length
                    ? `${languageText.flashcards.inboundNextPrefix} ${formatMinutes(annotatedPrimary[0].liveMinutes)}`
                    : languageText.flashcards.noDepartures}
                </strong>
              </div>
              <button
                className="flip-button"
                onClick={() => setActiveCard('outbound')}
                title={languageText.flashcards.flipToOutboundTitle}
              >
                ↻
              </button>
            </div>
            {annotatedPrimary.length ? (
              <div className="list-frame">
                <ul className="list">
                  {annotatedPrimary.slice(0, 8).map((p) => {
                    const classes = ['row', p.isMissed ? 'row--missed' : '', p.id === nextAccessibleId ? 'row--next' : '']
                      .filter(Boolean)
                      .join(' ');
                    const title = `${p.headsign || p.routeName || p.routeId || 'Train'}${
                      p.isMissed ? languageText.flashcards.missedSuffix : ''
                    }`;
                      return (
                        <li key={p.id} className={classes}>
                          <div className="row-left">
                            <span className="time-badge">{formatMinutes(p.liveMinutes)}</span>
                            <div className="details">
                              <div className="title">{title}</div>
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
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="empty primary-empty">{languageText.flashcards.primaryEmpty}</div>
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
                  <p className="panel-label">{languageText.flashcards.outboundLabel}</p>
                  <strong className="panel-title">{languageText.flashcards.outboundTitle}</strong>
                </div>
                <button
                  className="flip-button"
                  onClick={() => setActiveCard('inbound')}
                  title={languageText.flashcards.flipToInboundTitle}
                >
                  ↻
                </button>
              </div>
              {annotatedSecondary.length ? (
                <div className="list-frame">
                  <ul className="list">
                    {annotatedSecondary.slice(0, 10).map((p) => {
                      const classes = ['row', p.isMissed ? 'row--missed' : ''].filter(Boolean).join(' ');
                      const title = `${p.headsign || p.routeName || p.routeId || 'Train'}${
                        p.isMissed ? languageText.flashcards.missedSuffix : ''
                      }`;
                      return (
                        <li key={p.id} className={classes}>
                          <div className="row-left">
                            <span className="time-badge">{formatMinutes(p.liveMinutes)}</span>
                            <div className="details">
                              <div className="title">{title}</div>
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
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="empty secondary-empty">{languageText.flashcards.outboundEmpty}</div>
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
              <p className="panel-label">{languageText.volumePanel.label}</p>
              <strong className="panel-title">{automationStateLabel}</strong>
            </div>
          </div>
          <div className="volume-details">
            <div className="detail-line">
              {languageText.volumePanel.nextTriggerLabel}: {nextAutomationLabel}
            </div>
            <div className="detail-line">
              {languageText.volumePanel.statusLabel}:{' '}
              <span className={`status-chip ${automationStateClass}`}>{automationStateLabel}</span>
            </div>
          </div>
          <div className="volume-actions">
            <button className="action-button" disabled={automationAction.busy} onClick={() => triggerAutomation('raise')}>
              {languageText.volumePanel.raise}
            </button>
            <button
              className="action-button"
              disabled={automationAction.busy}
              onClick={() => triggerAutomation('restore')}
            >
              {languageText.volumePanel.restore}
            </button>
          </div>
          {automationAction.error ? <p className="alert inline-alert">{automationAction.error}</p> : null}
        </section>
      </main>
    </div>
  );
}
