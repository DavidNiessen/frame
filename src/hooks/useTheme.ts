import { useEffect, useState } from 'react';
export type Theme = 'system' | 'light' | 'dark' | 'high-contrast';
function savedTheme(value: string | null): Theme {
  // Preserve an explicit theme choice when upgrading from the retired theme.
  if (value === 'midnight') return 'high-contrast';
  return value === 'light' || value === 'dark' || value === 'high-contrast' ? value : 'system';
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return savedTheme(localStorage.getItem('frame-theme'));
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === 'frame-theme' || event.key === null) setTheme(savedTheme(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => {
    const preference = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (preference.matches ? 'dark' : 'light') : theme;
      document.documentElement.style.colorScheme =
        theme === 'system'
          ? preference.matches
            ? 'dark'
            : 'light'
          : theme === 'light'
            ? 'light'
            : 'dark';
    };
    apply();
    preference.addEventListener('change', apply);
    try {
      localStorage.setItem('frame-theme', theme);
    } catch {
      /* Storage is optional. */
    }
    return () => preference.removeEventListener('change', apply);
  }, [theme]);
  return { theme, setTheme };
}
