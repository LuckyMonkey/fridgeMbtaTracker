import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { translations } from './i18n';

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
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const MIN_MISS_MS = 3 * 60_000;
const MAX_PREDICTION_ROWS = 4;

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
const FALLBACK_STOP_ID = 'place-sdmnl';
const CARD_IDS = ['hero', 'timetable', 'wonderland', 'volume'];
const MIN_SWIPE_DISTANCE = 36;

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

const getLanguageText = (lang) => translations[lang] || translations[DEFAULT_LANGUAGE] || {};


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
  const [mobileCardIndex, setMobileCardIndex] = useState(0);
  const [cardTitleVisible, setCardTitleVisible] = useState(true);
  const [automationAction, setAutomationAction] = useState({ busy: false, error: '' });
  const [passNotice, setPassNotice] = useState('');
  const [passLoading, setPassLoading] = useState('');
  const [language, setLanguage] = useState(() => readLanguageCookie() || DEFAULT_LANGUAGE);
  const appVersion = import.meta.env.VITE_APP_VERSION || '0.2.0';
  const languageText = useMemo(() => getLanguageText(language), [language]);

  const pollRef = useRef(null);
  const automationPollRef = useRef(null);
  const swipeRef = useRef(null);

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
  const activeMobileCard = CARD_IDS[mobileCardIndex] || CARD_IDS[0];

  const cycleMobileCard = useCallback((direction) => {
    setMobileCardIndex((current) => {
      const next = current + direction;
      if (next < 0) return CARD_IDS.length - 1;
      if (next >= CARD_IDS.length) return 0;
      return next;
    });
  }, []);

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

  useEffect(() => {
    setCardTitleVisible(true);
    const timer = setTimeout(() => {
      setCardTitleVisible(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [activeMobileCard]);

  useEffect(() => {
    const container = swipeRef.current;
    if (!container) return undefined;
    let startX = null;

    const handlePointerStart = (event) => {
      startX = event.touches ? event.touches[0].clientX : event.clientX;
    };
    const handlePointerEnd = (event) => {
      if (startX === null) return;
      const endX = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
      const delta = endX - startX;
      if (Math.abs(delta) > MIN_SWIPE_DISTANCE) {
        cycleMobileCard(delta < 0 ? 1 : -1);
      }
      startX = null;
    };

    container.addEventListener('touchstart', handlePointerStart, { passive: true });
    container.addEventListener('touchend', handlePointerEnd);
    container.addEventListener('mousedown', handlePointerStart);
    container.addEventListener('mouseup', handlePointerEnd);

    return () => {
      container.removeEventListener('touchstart', handlePointerStart);
      container.removeEventListener('touchend', handlePointerEnd);
      container.removeEventListener('mousedown', handlePointerStart);
      container.removeEventListener('mouseup', handlePointerEnd);
    };
  }, [cycleMobileCard]);

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

// Render a capped list of predictions, highlighting the next train when needed.
const renderPredictionList = (items, { maxRows = MAX_PREDICTION_ROWS, emptyLabel = '', highlightId = null } = {}) => {
    if (!items.length) {
      return <div className="empty">{emptyLabel}</div>;
    }

    return (
      <div className="list-frame">
        <ul className="list">
          {items.slice(0, maxRows).map((prediction) => {
            const classes = ['row', prediction.isMissed ? 'row--missed' : '', highlightId === prediction.id ? 'row--next' : '']
              .filter(Boolean)
              .join(' ');
            const title = `${prediction.headsign || prediction.routeName || prediction.routeId || 'Train'}${
              prediction.isMissed ? languageText.flashcards.missedSuffix : ''
            }`;
            return (
              <li key={prediction.id} className={classes}>
                <div className="row-left">
                  <span className="time-badge">{formatMinutes(prediction.liveMinutes)}</span>
                  <div className="details">
                    <div className="title">{title}</div>
                    <div className="sub">
                      {prediction.status || (prediction.arrivalTime || prediction.departureTime ? languageText.flashcards.scheduledLabel : '—')}
                    </div>
                  </div>
                </div>
                <div className="row-right">
                  {prediction.routeId ? (
                    <span className="route-pill" style={{ '--route-color': getRouteColor(prediction.routeId) }}>
                      {prediction.routeId}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  useEffect(() => {
    if (!integrityOk) {
      console.warn('Prediction direction integrity failure', checklist);
    }
  }, [integrityOk, checklist]);

const walkIndicator = useMemo(() => {
    const text = languageText;
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
        leaveDeltaMs,
      };
    }

    if (leaveDeltaMs < MIN_MISS_MS) {
      return {
        urgency: 'soon',
        title: `${text.walk.leaveSoon} ${formatDuration(leaveDeltaMs)}`,
        subtitle: `${directionLabel} · ${headsign} · ${text.walk.trainIn} ${formatDuration(eventDeltaMs)}`,
        leaveDeltaMs,
      };
    }

    return {
      urgency: 'normal',
      title: `${text.walk.leaveSoon} ${formatDuration(leaveDeltaMs)}`,
      subtitle: `${directionLabel} · ${headsign} · ${text.walk.trainIn} ${formatDuration(eventDeltaMs)}`,
      leaveDeltaMs,
    };
}, [annotatedPrimary, languageText, nowMs, walkBufferMs]);

const heroTitle = walkIndicator?.title || languageText.flashcards.heroIdleTitle;
const heroSubtitle = walkIndicator?.subtitle || languageText.flashcards.heroIdleSubtitle;
const heroBufferLabel = languageText.walk.walkBufferText(
  walkMinutesLabel,
  Math.round(refreshIntervalMs / 1000)
);
const timetableHeadline =
  annotatedPrimary.length && annotatedPrimary[0].liveMinutes !== null
    ? `${languageText.flashcards.inboundNextPrefix} ${formatMinutes(annotatedPrimary[0].liveMinutes)}`
    : languageText.flashcards.primaryEmpty;
const cardLabels = {
  hero: languageText.flashcards.heroLabel,
  wonderland: languageText.flashcards.outboundLabel,
  timetable: languageText.flashcards.timetableLabel,
  volume: languageText.volumePanel.label,
};
const currentCardLabel = cardLabels[activeMobileCard] || '';

const handleTrainPass = useCallback(
  async (direction, predictions) => {
    const directionLabel = languageText.volumePanel.directions[direction] || (direction === 'bowdoin' ? 'Bowdoin' : 'Wonderland');
    if (!predictions.length) {
      setPassNotice(`No ${directionLabel} predictions available`);
      return;
    }
    const prediction = predictions[0];
    const measurementMs = Date.now();
    const minutes = Number.isFinite(prediction.liveMinutes) ? prediction.liveMinutes : null;
    const predictedAtMs =
      Number.isFinite(prediction.eventMs) && prediction.eventMs > 0
        ? prediction.eventMs
        : minutes !== null
        ? measurementMs + minutes * 60_000
        : null;

    const stopId = selectedStopId || FALLBACK_STOP_ID;
    setPassLoading(direction);
    setPassNotice(`Logging ${directionLabel} pass…`);

    try {
      const res = await fetch('/api/train-pass', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stopId,
          direction,
          predictionId: prediction.id,
          predictedAtMs,
          measuredAtMs: measurementMs,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Unable to log train pass');
      }
      const offsetMs = Number.isFinite(json?.offsetMs) ? json.offsetMs : null;
      const offsetLabel =
        offsetMs === null ? 'offset unknown' : `${offsetMs >= 0 ? '+' : ''}${Math.round(offsetMs / 1000)}s`;
      setPassNotice(`Logged ${directionLabel} pass (${offsetLabel})`);
    } catch (err) {
      setPassNotice(`Failed to log ${directionLabel} pass: ${err?.message || 'unknown error'}`);
    } finally {
      setPassLoading('');
    }
  },
  [languageText, selectedStopId]
);

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

  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return undefined;
    if (!('wakeLock' in navigator)) return undefined;
    let wakeLock = null;
    const requestLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener?.('release', () => {
          wakeLock = null;
        });
      } catch (error) {
        console.error('Wake lock request failed', error);
      }
    };
    requestLock();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLock?.release?.();
    };
  }, []);

  return (
    <div className="page min-h-screen bg-slate-50 text-slate-900" style={{ '--mbta-accent': dominantColor }}>
      <header className="header">
        <div className="brand">
          <h1>🔵 Suffolk Downs</h1>
        </div>
        <div className="header-controls">
          <button className="lang-toggle" type="button" onClick={toggleLanguage} aria-pressed={language === 'en'}>
            {language === 'es' ? languageText.controls.switchToEnglish : languageText.controls.switchToSpanish}
          </button>
          <span className="version-chip">v{appVersion}</span>
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

        <section className="flashcard-wrapper">
          <div className="flashcard-stack" ref={swipeRef}>
            <article className={`flashcard hero-card ${activeMobileCard === 'hero' ? 'flashcard--active' : ''}`}>
              <div
                className="panel-heading"
                data-title-visible={activeMobileCard === 'hero' ? String(cardTitleVisible) : 'true'}
              >
                <span className="panel-emoji" role="presentation">
                  🚶
                </span>
                <div>
                  <p className="panel-label">{languageText.flashcards.heroLabel}</p>
                  <strong className="panel-title">{heroTitle}</strong>
                </div>
              </div>
              <div className="hero-display">
                <p className="hero-subtitle">{heroSubtitle}</p>
                <p className="hero-meta">{heroBufferLabel}</p>
              </div>
            </article>

            <article className={`flashcard timetable-card ${activeMobileCard === 'timetable' ? 'flashcard--active' : ''}`}>
              <div
                className="panel-heading"
                data-title-visible={activeMobileCard === 'timetable' ? String(cardTitleVisible) : 'true'}
              >
                <span className="panel-emoji" role="presentation">
                  ⬆️
                </span>
                <div>
                  <p className="panel-label">{languageText.flashcards.timetableLabel}</p>
                  <strong className="panel-title">{timetableHeadline}</strong>
                </div>
              </div>
              <div className="timetable-section">
                <div className="section-heading">
                  <span className="section-title">{languageText.flashcards.inboundLabel}</span>
                </div>
                {renderPredictionList(annotatedPrimary, {
                  maxRows: MAX_PREDICTION_ROWS,
                  emptyLabel: languageText.flashcards.primaryEmpty,
                  highlightId: nextAccessibleId,
                })}
              </div>
            </article>

            <article className={`flashcard wonderland-card ${activeMobileCard === 'wonderland' ? 'flashcard--active' : ''}`}>
              <div
                className="panel-heading"
                data-title-visible={activeMobileCard === 'wonderland' ? String(cardTitleVisible) : 'true'}
              >
                <span className="panel-emoji" role="presentation">
                  ↩️
                </span>
                <div>
                  <p className="panel-label">{languageText.flashcards.outboundLabel}</p>
                  <strong className="panel-title">{languageText.flashcards.outboundTitle}</strong>
                </div>
              </div>
              <div className="timetable-section outbound">
                {renderPredictionList(annotatedSecondary, {
                  maxRows: MAX_PREDICTION_ROWS,
                  emptyLabel: languageText.flashcards.outboundEmpty,
                })}
              </div>
            </article>

            <article className={`flashcard volume-card ${activeMobileCard === 'volume' ? 'flashcard--active' : ''}`}>
              <div
                className="panel-heading"
                data-title-visible={activeMobileCard === 'volume' ? String(cardTitleVisible) : 'true'}
              >
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
              <div className="pass-actions">
                <button
                  className="pass-button"
                  onClick={() => handleTrainPass('bowdoin', annotatedPrimary)}
                  disabled={passLoading === 'bowdoin'}
                >
                  {languageText.volumePanel.passButtons.bowdoin}
                </button>
                <button
                  className="pass-button"
                  onClick={() => handleTrainPass('wonderland', annotatedSecondary)}
                  disabled={passLoading === 'wonderland'}
                >
                  {languageText.volumePanel.passButtons.wonderland}
                </button>
              </div>
              <p className="pass-note">{languageText.volumePanel.passHelp}</p>
              {passNotice ? <p className="pass-note pass-note--status">{passNotice}</p> : null}
              {automationAction.error ? <p className="alert inline-alert">{automationAction.error}</p> : null}
            </article>

            <div className="card-navigation" role="navigation" aria-label={languageText.flashcards.navigationLabel}>
              <button
                type="button"
                className="card-switch card-switch--prev"
                aria-label={languageText.flashcards.prevCard}
                title={languageText.flashcards.prevCard}
                onClick={() => cycleMobileCard(-1)}
              >
                ‹
              </button>
              <div className="card-indicators" aria-hidden="true">
                {CARD_IDS.map((cardId, index) => (
                  <button
                    key={cardId}
                    type="button"
                    className={`card-dot ${activeMobileCard === cardId ? 'card-dot--active' : ''}`}
                    onClick={() => setMobileCardIndex(index)}
                    title={cardLabels[cardId] || cardId}
                    aria-label={cardLabels[cardId] || cardId}
                  />
                ))}
              </div>
              <button
                type="button"
                className="card-switch card-switch--next"
                aria-label={languageText.flashcards.nextCard}
                title={languageText.flashcards.nextCard}
                onClick={() => cycleMobileCard(1)}
              >
                ›
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
