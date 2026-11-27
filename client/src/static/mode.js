// Static demo build (GitHub Pages): `npm run build:pages` sets VITE_STATIC_DEMO=true. There is no server: the API
// layer reads JSON files exported from a real demo notebook (scripts/export-static-demo.mjs), see ./adapter.js.
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true';

export const READ_ONLY_MESSAGE = 'Read-only demo: run ExamLens locally for live AI.';

export const REPO_URL = 'https://github.com/sachinkatigar23/examlens';
// Set VITE_DEMO_VIDEO_URL (a GitHub Actions variable, DEMO_VIDEO_URL) to show the video link in the banner.
export const VIDEO_URL = import.meta.env.VITE_DEMO_VIDEO_URL || '';

// Where the exported files are served: <base>/static-demo/... (base is /examlens/ on GitHub Pages).
export const DATA_URL = `${import.meta.env.BASE_URL}static-demo`;

// "/spaces/abc/revision/Unit 2" → "spaces/abc/revision/Unit_2.json". The export script uses the same rule.
export const fileFor = (path) =>
  `${path
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9_-]/g, '_'))
    .join('/')}.json`;
