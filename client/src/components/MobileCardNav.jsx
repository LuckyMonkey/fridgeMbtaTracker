import React from 'react';

export default function MobileCardNav({
  languageText,
  activeMobileCard,
  setMobileCardIndex,
  cycleMobileCard,
  cardLabels,
}) {
  return (
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
        <button
          type="button"
          className={`card-dot ${activeMobileCard === 'hero' ? 'card-dot--active' : ''}`}
          onClick={() => setMobileCardIndex(0)}
          title={cardLabels.hero || 'hero'}
          aria-label={cardLabels.hero || 'hero'}
        />
        <button
          type="button"
          className={`card-dot ${activeMobileCard === 'timetable' ? 'card-dot--active' : ''}`}
          onClick={() => setMobileCardIndex(1)}
          title={cardLabels.timetable || 'timetable'}
          aria-label={cardLabels.timetable || 'timetable'}
        />
        <button
          type="button"
          className={`card-dot ${activeMobileCard === 'wonderland' ? 'card-dot--active' : ''}`}
          onClick={() => setMobileCardIndex(2)}
          title={cardLabels.wonderland || 'wonderland'}
          aria-label={cardLabels.wonderland || 'wonderland'}
        />
        <button
          type="button"
          className={`card-dot ${activeMobileCard === 'volume' ? 'card-dot--active' : ''}`}
          onClick={() => setMobileCardIndex(3)}
          title={cardLabels.volume || 'volume'}
          aria-label={cardLabels.volume || 'volume'}
        />
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
  );
}
