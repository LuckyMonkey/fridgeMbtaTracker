import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'mbta-blind-mode';

const readInitialState = () => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch (err) {
    console.error('Unable to read blind mode preference', err);
    return false;
  }
};

const persistState = (value) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.error('Unable to persist blind mode preference', err);
  }
};

export default function useBlindMode() {
  const [blindMode, setBlindModeRaw] = useState(readInitialState);

  useEffect(() => {
    persistState(blindMode);
  }, [blindMode]);

  const enableBlindMode = useCallback(() => setBlindModeRaw(true), []);
  const disableBlindMode = useCallback(() => setBlindModeRaw(false), []);
  const toggleBlindMode = useCallback(() => setBlindModeRaw((prev) => !prev), []);
  const setBlindMode = useCallback((value) => setBlindModeRaw(Boolean(value)), []);

  return {
    blindMode,
    enableBlindMode,
    disableBlindMode,
    toggleBlindMode,
    setBlindMode,
  };
}
