import { useEffect, useState } from 'react';

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

// 'scene' when the 3D landing can run, otherwise why not: 'reduced-motion' or 'no-webgl' (→ static illustration).
export function useCanAnimate3D() {
  const [mode, setMode] = useState(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced-motion';
    return hasWebGL() ? 'scene' : 'no-webgl';
  });

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMode(query.matches ? 'reduced-motion' : hasWebGL() ? 'scene' : 'no-webgl');
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return mode;
}
