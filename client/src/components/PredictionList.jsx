import React from 'react';

const MAX_PREDICTION_ROWS = 4;

const formatMinutes = (minutes) => {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes <= 0) return 'Now';
  return `${minutes} min`;
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

export default function PredictionList({ items, languageText, maxRows = MAX_PREDICTION_ROWS, emptyLabel = '', highlightId = null }) {
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
}
