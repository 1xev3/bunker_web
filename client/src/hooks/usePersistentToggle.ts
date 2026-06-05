import { useCallback, useState } from 'react';

// A boolean flag persisted in localStorage so a UI preference (e.g. whether the
// event help panel is open) survives reloads on the same device.
export function usePersistentToggle(key: string, defaultValue = false): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultValue;
    const stored = window.localStorage.getItem(key);
    return stored === null ? defaultValue : stored === 'true';
  });

  const set = useCallback((next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // ignore storage failures (private mode, quota, etc.)
    }
  }, [key]);

  const toggle = useCallback(() => set(!value), [set, value]);

  return [value, toggle, set];
}
