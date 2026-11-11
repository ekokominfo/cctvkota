import { chromium, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pool } from '../apps/api/src/db.js';
if (
  process.env.ALLOW_LOCAL_FIXTURES !== '1' ||
  new URL(process.env.DATABASE_URL!).hostname !== '127.0.0.1'
)
  throw new Error('Explicit local fixture opt-in required');
const suffix = randomBytes(6).toString('hex'),
  paths: string[] = [],
  ids: string[] = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  for (let i = 1; i <= 16; i++) {
    const path = `load_${suffix}_${i}`;
    paths.push(path);
    const r = await fetch(`http://127.0.0.1:9997/v3/config/paths/add/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'rtsp://127.0.0.1:8554/demo',
        rtspTransport: 'tcp',
        sourceOnDemand: false,
      }),
    });
    if (!r.ok) throw new Error('Cannot configure synthetic path');
    ids.push(
      (
        await pool.query(
          'INSERT INTO cameras(name,location,stream_path,public_approved) VALUES ($1,$2,$3,true) RETURNING id',
          [`Load ${suffix} ${String(i).padStart(2, '0')}`, 'Synthetic local source', path],
        )
      ).rows[0].id,
    );
  }
  const page = await browser.newPage({ viewport: { width: 1920, height: 2200 } });
  const errors: string[] = [],
    times: number[] = [];
  let requests = 0,
    bytes = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.url().includes('/api/streams/')) {
      requests++;
      if (r.status() >= 400) errors.push(`HTTP ${r.status()}`);
      const t = r.request().timing();
      if (t.responseStart >= 0) times.push(t.responseStart);
      bytes += Number(r.headers()['content-length'] || 0);
    }
  });
  await page.goto('http://localhost:3000');
  await page.getByLabel('Cari kamera atau lokasi').fill(`Load ${suffix}`);
  await expect(page.locator('.camera-card')).toHaveCount(16);
  await page.getByRole('button', { name: '4 kolom', exact: true }).click();
  const started = Date.now();
  await page.getByRole('button', { name: 'Putar semua · maks. 16', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(16);
  await expect
    .poll(
      () =>
        page
          .locator('video')
          .evaluateAll(
            (videos: HTMLVideoElement[]) =>
              videos.filter((v) => v.currentTime > 3 && v.videoWidth > 0).length,
          ),
      { timeout: 60000 },
    )
    .toBe(16)
    .catch(async (e) => {
      console.log(
        'Playback diagnosis:',
        await page.locator('video').evaluateAll((vs: HTMLVideoElement[]) =>
          vs.map((v) => ({
            time: v.currentTime,
            ready: v.readyState,
            paused: v.paused,
            error: v.error?.code,
          })),
        ),
        errors,
      );
      throw e;
    });
  // Additional 20s sampling validates continuous segment retrieval after startup.
  await page.waitForTimeout(20000);
  const playback = await page.locator('video').evaluateAll((videos: HTMLVideoElement[]) =>
    videos.map((v) => ({
      width: v.videoWidth,
      height: v.videoHeight,
      time: v.currentTime,
      frames: v.getVideoPlaybackQuality().totalVideoFrames,
      dropped: v.getVideoPlaybackQuality().droppedVideoFrames,
    })),
  );
  expect(playback.every((p) => p.time > 10 && p.frames > 30)).toBe(true);
  expect(errors).toEqual([]);
  times.sort((a, b) => a - b);
  const report = {
    timestamp: new Date().toISOString(),
    source:
      'One synthetic H264 1280x720 15fps publisher relayed into 16 distinct MediaMTX paths; not 16 physical NVR ingests',
    durationSeconds: (Date.now() - started) / 1000,
    concurrentPlayers: 16,
    requests,
    contentLengthHeaderBytesOnly: bytes,
    p95ResponseStartMs: times[Math.min(times.length - 1, Math.floor(times.length * 0.95))],
    errors,
    playback,
  };
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/load-16.json', JSON.stringify(report, null, 2));
  await page.screenshot({ path: 'artifacts/load-16.png', fullPage: true });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  if (ids.length) await pool.query('DELETE FROM cameras WHERE id=ANY($1::uuid[])', [ids]);
  for (const path of paths)
    await fetch(`http://127.0.0.1:9997/v3/config/paths/delete/${path}`, { method: 'DELETE' }).catch(
      () => {},
    );
  await pool.end();
}
