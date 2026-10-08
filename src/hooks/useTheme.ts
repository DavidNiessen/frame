import { useEffect, useState } from 'react';
export type Theme = 'system' | 'light' | 'dark' | 'midnight';
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('frame-theme');
      return ['system', 'light', 'dark', 'midnight'].includes(saved ?? '') ? saved as Theme : 'system';
    } catch { return 'system'; }
  });
  useEffect(() => {
    const preference = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? preference.matches ? 'dark' : 'light' : theme;
      document.documentElement.style.colorScheme = theme === 'system' ? preference.matches ? 'dark' : 'light' : theme === 'light' ? 'light' : 'dark';
    };
    apply(); preference.addEventListener('change', apply);
    try { localStorage.setItem('frame-theme', theme); } catch { /* Storage is optional. */ }
    return () => preference.removeEventListener('change', apply);
  }, [theme]);
  return { theme, setTheme };
}
