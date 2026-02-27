import React from 'react';

export default function VolumePanel({
  active,
  cardTitleVisible,
  languageText,
  automationStateLabel,
  automationStateClass,
  nextAutomationLabel,
  automationAction,
  triggerAutomation,
  handleTrainPass,
  annotatedPrimary,
  annotatedSecondary,
  passLoading,
  passNotice,
}) {
  return (
    <article className={`flashcard volume-card ${active ? 'flashcard--active' : ''}`}>
      <div className="panel-heading" data-title-visible={active ? String(cardTitleVisible) : 'true'}>
        <span className="panel-emoji" role="presentation">🔊</span>
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
        <button className="action-button" disabled={automationAction.busy} onClick={() => triggerAutomation('restore')}>
          {languageText.volumePanel.restore}
        </button>
      </div>
      <div className="pass-actions">
        <button className="pass-button" onClick={() => handleTrainPass('bowdoin', annotatedPrimary)} disabled={passLoading === 'bowdoin'}>
          {languageText.volumePanel.passButtons.bowdoin}
        </button>
        <button className="pass-button" onClick={() => handleTrainPass('wonderland', annotatedSecondary)} disabled={passLoading === 'wonderland'}>
          {languageText.volumePanel.passButtons.wonderland}
        </button>
      </div>
      <p className="pass-note">{languageText.volumePanel.passHelp}</p>
      {passNotice ? <p className="pass-note pass-note--status">{passNotice}</p> : null}
      {automationAction.error ? <p className="alert inline-alert">{automationAction.error}</p> : null}
    </article>
  );
}
