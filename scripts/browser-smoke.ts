import { chromium, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import * as OTPAuth from 'otpauth';
import { pool } from '../apps/api/src/db.js';
import { hashPassword, seal } from '../apps/api/src/crypto.js';
if (
  process.env.ALLOW_LOCAL_FIXTURES !== '1' ||
  new URL(process.env.DATABASE_URL!).hostname !== '127.0.0.1'
)
  throw new Error('Local fixture opt-in and loopback database required');
const base = 'http://localhost:3000',
  suffix = randomBytes(6).toString('hex'),
  email = `browser-${suffix}@test.local`,
  password = randomBytes(24).toString('hex');
const otp = new OTPAuth.TOTP({ issuer: 'CCTV test', label: email });
let adminId: string | undefined, cameraId: string | undefined;
const path = `browser_${suffix}`,
  cameraName = `Browser private ${suffix}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  adminId = (
    await pool.query(
      "INSERT INTO users(email,password_hash,role,totp_secret) VALUES ($1,$2,'admin',$3) RETURNING id",
      [
        email,
        await hashPassword(password),
        seal(otp.secret.base32, process.env.MFA_ENCRYPTION_KEY!),
      ],
    )
  ).rows[0].id;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage();
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Pantau kota, dalam satu layar.' })).toBeVisible();
  await expect(page.getByText('Demo • Test Pattern', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Putar Demo • Test Pattern', exact: true }).click();
  await expect
    .poll(
      () =>
        page
          .locator('video')
          .first()
          .evaluate((v: HTMLVideoElement) => v.currentTime),
      { timeout: 30000 },
    )
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Ganti tema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Ganti tema' }).click();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /Masuk akun/ }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Kata sandi', { exact: true }).fill(password);
  if (Date.now() % 30000 > 25000) await new Promise((r) => setTimeout(r, 5500));
  await page.getByLabel('Kode MFA', { exact: false }).fill(otp.generate());
  await page.getByRole('button', { name: 'Masuk dengan aman' }).click();
  await expect(page.getByText('Administrator · MFA')).toBeVisible();
  await page.getByRole('button', { name: 'Administrasi', exact: false }).click();
  await page.getByLabel('Nama kamera', { exact: true }).fill(cameraName);
  await page.getByLabel('Lokasi', { exact: true }).fill('Synthetic laboratory');
  await page.getByLabel('Path stream MediaMTX').fill(path);
  await page.getByRole('button', { name: 'Simpan kamera' }).click();
  await expect(
    page.locator('.admin-row strong').filter({ hasText: cameraName }).first(),
  ).toBeVisible();
  cameraId = (await pool.query('SELECT id FROM cameras WHERE stream_path=$1', [path])).rows[0].id;
  const added = await fetch(`http://127.0.0.1:9997/v3/config/paths/add/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'rtsp://127.0.0.1:8554/demo',
      rtspTransport: 'tcp',
      sourceOnDemand: false,
    }),
  });
  expect(added.ok).toBe(true);
  await page.getByRole('button', { name: /Pemantauan/ }).click();
  await expect(page.getByText(cameraName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Putar ${cameraName}`, exact: true }).click();
  const privateVideo = page.getByLabel(`Siaran ${cameraName}`);
  await expect
    .poll(() => privateVideo.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30000 })
    .toBeGreaterThan(1);
  const anonymous = await browser.newContext();
  const denied = await anonymous.request.get(`${base}/api/streams/${cameraId}/index.m3u8`);
  expect(denied.status()).toBe(404);
  await anonymous.close();
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.getByText(cameraName, { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/dashboard-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(failures).toEqual([]);
  console.log(
    'PASS browser: real public/private HLS decoding, MFA login, admin create, shared URL denial, logout, theme, mobile layout; no page errors.',
  );
} finally {
  await browser.close();
  await pool.query('DELETE FROM cameras WHERE stream_path=$1', [path]);
  if (adminId) await pool.query('DELETE FROM users WHERE id=$1', [adminId]);
  await fetch(`http://127.0.0.1:9997/v3/config/paths/delete/${path}`, { method: 'DELETE' }).catch(
    () => {},
  );
  await pool.end();
}
