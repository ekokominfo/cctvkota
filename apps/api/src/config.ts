import { z } from 'zod';
export function config() {
  const e = z
    .object({
      DATABASE_URL: z.string().min(1),
      APP_ORIGIN: z.url(),
      MFA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      MEDIAMTX_HLS_URL: z.url().default('http://127.0.0.1:8888'),
      MEDIAMTX_API_URL: z.url().default('http://127.0.0.1:9997'),
    })
    .parse(process.env);
  if (e.NODE_ENV === 'production' && !e.APP_ORIGIN.startsWith('https://'))
    throw new Error('Production APP_ORIGIN requires HTTPS');
  if (new URL(e.APP_ORIGIN).origin !== e.APP_ORIGIN)
    throw new Error('APP_ORIGIN must be an origin without path or trailing slash');
  return e;
}
