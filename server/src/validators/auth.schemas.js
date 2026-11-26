import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  email: z.email('Enter a valid email').trim().toLowerCase(),
  // bcrypt only uses the first 72 bytes
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

export const loginSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});
