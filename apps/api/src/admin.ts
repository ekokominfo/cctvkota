import { z } from 'zod';
import * as OTPAuth from 'otpauth';
import { pool } from './db.js';
import { hashPassword, seal } from './crypto.js';
const env = z.object({ BOOTSTRAP_ADMIN_EMAIL: z.email().transform(s=>s.toLowerCase()), BOOTSTRAP_ADMIN_PASSWORD: z.string().min(14).max(128), MFA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/) }).parse(process.env);
try {
 const otp = new OTPAuth.TOTP({ issuer: 'CCTV Portal', label: env.BOOTSTRAP_ADMIN_EMAIL, algorithm:'SHA1',digits:6,period:30 });
 await pool.query('INSERT INTO users(email,password_hash,role,totp_secret) VALUES ($1,$2,$3,$4)', [env.BOOTSTRAP_ADMIN_EMAIL, await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD), 'admin', seal(otp.secret.base32, env.MFA_ENCRYPTION_KEY)]);
 console.log('Administrator created. Import this URI into an authenticator using a private terminal; it is a secret. No recovery bypass exists.');
 console.log(otp.toString());
} finally { await pool.end(); }
