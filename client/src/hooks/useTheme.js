import { useCallback, useEffect, useState } from 'react';

const KEY = 'examlens-theme';
const META_COLORS = { light: '#F5F1E8', dark: '#0F1626' };

// The class is first set by the inline script in index.html (before React loads, so there's no flash of
// the wrong theme). This hook reads it back and lets the user switch; the choice is remembered.
const current = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

function apply(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme]);
}

export function useTheme() {
  const [theme, setTheme] = useState(current);

  useEffect(() => {
    apply(theme);
    // Keep every mounted toggle in sync (the header and the landing page each have one).
    window.dispatchEvent(new CustomEvent('examlens-theme', { detail: theme }));
  }, [theme]);

  useEffect(() => {
    const sync = (e) => setTheme(e.detail);
    window.addEventListener('examlens-theme', sync);
    return () => window.removeEventListener('examlens-theme', sync);
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
