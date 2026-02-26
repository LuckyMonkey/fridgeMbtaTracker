import React from 'react';

export default function AccessPrompt({
  visible,
  onEnable,
  onDismiss,
  message = 'Enable accessibility mode?',
  enableLabel = 'Enable accessible view',
  dismissLabel = 'Continue with normal view',
}) {
  if (!visible) return null;
  return (
    <aside className="access-prompt" role="region" aria-live="polite">
      <p className="access-prompt__message">{message}</p>
      <div className="access-prompt__actions">
        <button type="button" onClick={onEnable} className="access-prompt__button">
          {enableLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="access-prompt__button access-prompt__button--secondary"
        >
          {dismissLabel}
        </button>
      </div>
    </aside>
  );
}
