const MBTA_BASE_URL = 'https://api-v3.mbta.com';

const buildUrl = (path, searchParams) => {
  const url = new URL(path, MBTA_BASE_URL);
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const mbtaFetchJson = async ({ path, searchParams, apiKey, signal }) => {
  const url = buildUrl(path, searchParams);
  const headers = {};
  if (apiKey) headers['x-api-key'] = apiKey;

  const response = await fetch(url, { headers, signal });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`MBTA API error ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.url = url;
    error.body = text;
    throw error;
  }
  return response.json();
};

const directionLabel = (directionId) => (directionId === 0 ? 'Outbound' : 'Inbound');

const toMinutesFromNow = (isoTimestamp) => {
  if (!isoTimestamp) return null;
  const ms = Date.parse(isoTimestamp);
  if (Number.isNaN(ms)) return null;
  return Math.round((ms - Date.now()) / 60000);
};

const getIncludedByTypeAndId = (payload) => {
  const map = new Map();
  const included = Array.isArray(payload?.included) ? payload.included : [];
  for (const item of included) {
    if (!item?.type || !item?.id) continue;
    map.set(`${item.type}:${item.id}`, item);
  }
  return (type, id) => map.get(`${type}:${id}`);
};

const fetchStopPredictions = async ({
  stopId,
  apiKey,
  routeType,
  routeId,
  limit = 12,
  signal,
}) => {
  const payload = await mbtaFetchJson({
    path: '/predictions',
    searchParams: {
      'filter[stop]': stopId,
      ...(routeType !== undefined ? { 'filter[route_type]': routeType } : null),
      ...(routeId ? { 'filter[route]': routeId } : null),
      include: 'route,trip',
      sort: 'arrival_time',
      'page[limit]': limit,
    },
    apiKey,
    signal,
  });

  const getIncluded = getIncludedByTypeAndId(payload);

  const predictions = (payload?.data || []).map((item) => {
    const attributes = item?.attributes || {};
    const relationships = item?.relationships || {};
    const routeIdFromRel = relationships?.route?.data?.id;
    const tripIdFromRel = relationships?.trip?.data?.id;

    const route = routeIdFromRel ? getIncluded('route', routeIdFromRel) : null;
    const trip = tripIdFromRel ? getIncluded('trip', tripIdFromRel) : null;

    const arrivalTime = attributes.arrival_time || null;
    const departureTime = attributes.departure_time || null;
    const bestTime = arrivalTime || departureTime;

    const directionId = attributes.direction_id;
    return {
      id: item.id,
      directionId,
      direction: directionLabel(directionId),
      status: attributes.status || null,
      arrivalTime,
      departureTime,
      minutes: toMinutesFromNow(bestTime),
      routeId: route?.id || routeIdFromRel || null,
      routeName: route?.attributes?.long_name || route?.attributes?.short_name || null,
      headsign: trip?.attributes?.headsign || null,
    };
  });

  return {
    stopId,
    fetchedAt: new Date().toISOString(),
    predictions,
  };
};

module.exports = {
  fetchStopPredictions,
};

