import { useEffect, useMemo, useState, useSyncExternalStore as useSES } from 'react';

const getMediaQueryList = (query) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia(query);
};

const addListener = (mediaQueryList, changeHandler) => {
  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', changeHandler);
    return () => mediaQueryList.removeEventListener('change', changeHandler);
  }
  mediaQueryList.addListener(changeHandler);
  return () => mediaQueryList.removeListener(changeHandler);
};

const getMatches = (query, defaultValue) => {
  const mediaQueryList = getMediaQueryList(query);
  if (!mediaQueryList) return defaultValue;
  return mediaQueryList.matches;
};

/**
 * Hook to read a media query with an SSR-safe snapshot and subscription. useSyncExternalStore keeps
 * the value stable across server/client renders while still updating on the client without flicker.
 */
// Fall back to a useState-based subscription when useSyncExternalStore is unavailable.
const createUseSyncFallback = (subscribe, getSnapshot) => {
  const [state, setState] = useState(getSnapshot);

  useEffect(() => {
    const update = () => {
      setState(getSnapshot());
    };
    const unsubscribe = subscribe(update);
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [getSnapshot, subscribe]);

  return state;
};

export default function useMediaQuery(query, options = {}) {
  const { defaultValue = false } = options;

  const subscribe = useMemo(() => {
    return (notify) => {
      const mediaQueryList = getMediaQueryList(query);
      if (!mediaQueryList) {
        return () => {};
      }
      return addListener(mediaQueryList, () => notify(mediaQueryList.matches));
    };
  }, [query]);

  const getSnapshot = useMemo(() => () => getMatches(query, defaultValue), [query, defaultValue]);
  const getServerSnapshot = useMemo(() => () => defaultValue, [defaultValue]);

  const useSafeSyncStore = typeof useSES === 'function' ? useSES : createUseSyncFallback;
  return useSafeSyncStore(subscribe, getSnapshot, getServerSnapshot);
}
