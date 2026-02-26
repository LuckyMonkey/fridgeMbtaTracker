import React from 'react';

const MAX_ROWS = 4;

const formatPredictionText = (prediction) => {
  const minutes = prediction.liveMinutes;
  if (minutes === null || minutes === undefined) return '—';
  if (minutes <= 0) return 'Now';
  return `${minutes} min`;
};

export default function BlindModeView({
  heroTitle,
  heroSubtitle,
  walkBufferLabel,
  annotatedPrimary,
  annotatedSecondary,
  nextAccessibleId,
  handleTrainPass,
  passLoading,
  passNotice,
  automationStateLabel,
  nextAutomationLabel,
  languageText,
  announcement,
  headingRef,
  isCliMode,
  lastUpdated,
}) {
  const renderList = (items, label, fallback) => (
    <section className="blind-section">
      <h2>{label}</h2>
      <p className="blind-section__label">{fallback}</p>
      <ul>
        {items.slice(0, MAX_ROWS).map((prediction) => {
          const status = prediction.isMissed ? ' (missed)' : '';
          const nextMarker = nextAccessibleId === prediction.id ? ' → next catchable' : '';
          return (
            <li key={prediction.id}>
              <strong>
                {prediction.headsign || prediction.routeName || prediction.routeId || languageText.flashcards.heroIdleTitle}
              </strong>
              <p>
                {formatPredictionText(prediction)}{status}{nextMarker}
              </p>
            </li>
          );
        })}
        {!items.length && <li className="blind-empty">{languageText.flashcards.primaryEmpty}</li>}
      </ul>
    </section>
  );

  return (
    <div className={isCliMode ? 'blind-page blind-page--cli' : 'blind-page'}>
      <header className="blind-header">
        <p className="blind-tag">{languageText.flashcards.heroLabel}</p>
        <h1 tabIndex={-1} ref={headingRef}>
          {heroTitle}
        </h1>
        <p className="blind-subtitle">{heroSubtitle}</p>
        <p className="blind-meta">{walkBufferLabel}</p>
      </header>
      <div className="blind-live" aria-live="polite">
        {announcement || languageText.flashcards.heroIdleSubtitle}
      </div>
      <nav className="blind-nav">
        {renderList(annotatedPrimary, languageText.flashcards.inboundLabel, languageText.flashcards.primaryEmpty)}
        {renderList(annotatedSecondary, languageText.flashcards.outboundLabel, languageText.flashcards.outboundEmpty)}
      </nav>
      <section className="blind-actions">
        <p>{languageText.volumePanel.passHelp}</p>
        <div className="blind-actions__buttons">
          <button
            type="button"
            disabled={passLoading === 'bowdoin'}
            onClick={() => handleTrainPass('bowdoin', annotatedPrimary)}
          >
            {languageText.volumePanel.passButtons.bowdoin}
          </button>
          <button
            type="button"
            disabled={passLoading === 'wonderland'}
            onClick={() => handleTrainPass('wonderland', annotatedSecondary)}
          >
            {languageText.volumePanel.passButtons.wonderland}
          </button>
        </div>
        {passNotice ? <p className="blind-note">{passNotice}</p> : null}
      </section>
      <footer className="blind-footer">
        <p>
          {languageText.volumePanel.statusLabel}: <strong>{automationStateLabel}</strong>
        </p>
        <p>{nextAutomationLabel}</p>
        <p>
          {languageText.status.updated}: {lastUpdated}
        </p>
      </footer>
    </div>
  );
}
