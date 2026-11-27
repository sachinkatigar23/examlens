import { env } from '../config/env.js';
import { AppError } from './AppError.js';

// Public demo mode (PUBLIC_DEMO=true): everyone shares one account, so it is read-only (see
// middleware/demoReadOnly.js) and its sessions aren't tracked one by one (see services/authService.js).
export const isDemoUser = (user) => env.publicDemo && Boolean(user?.email) && user.email === env.demoEmail;

export const demoReadOnly = (message = 'This is a read-only public demo. Run ExamLens yourself to use your own notes.') =>
  new AppError(403, 'DEMO_READ_ONLY', message);

export const alreadyWritten = (what) => demoReadOnly(`The demo's ${what} is already written, and the demo is read-only.`);
