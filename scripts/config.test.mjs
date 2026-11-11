import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const script = fileURLToPath(new URL('./render-nvr-config.mjs', import.meta.url));
test('private renderer encodes server-only credentials, protects permissions, disables publish and refuses overwrite', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cctv-render-'));
  const username = randomBytes(12).toString('base64'),
    password = randomBytes(24).toString('base64') + '@:/?';
  const env = {
    ...process.env,
    NVR_HOST: '172.16.10.7',
    NVR_USERNAME: username,
    NVR_PASSWORD: password,
    NVR_CHANNELS: JSON.stringify([{ path: 'cam_test', channel: '102' }]),
  };
  try {
    const result = spawnSync(process.execPath, [script], { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.ok(!result.stdout.includes(password));
    const path = join(cwd, 'secrets/mediamtx.yml'),
      cfg = JSON.parse(await readFile(path, 'utf8')),
      url = new URL(cfg.paths.cam_test.source);
    assert.equal(decodeURIComponent(url.username), username);
    assert.equal(decodeURIComponent(url.password), password);
    assert.equal(url.hostname, '172.16.10.7');
    assert.equal(url.pathname, '/Streaming/Channels/102');
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(cfg.paths.cam_test.sourceOnDemand, false);
    assert.equal(cfg.webrtc, false);
    assert.ok(!JSON.stringify(cfg.authInternalUsers).includes('publish'));
    assert.notEqual(
      spawnSync(process.execPath, [script], { cwd, env, encoding: 'utf8' }).status,
      0,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
test('private renderer refuses duplicate ingest channels', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cctv-render-'));
  try {
    const result = spawnSync(process.execPath, [script], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        NVR_HOST: '172.16.10.7',
        NVR_USERNAME: randomBytes(8).toString('hex'),
        NVR_PASSWORD: randomBytes(8).toString('hex'),
        NVR_CHANNELS: JSON.stringify([
          { path: 'cam_a', channel: '102' },
          { path: 'cam_b', channel: '102' },
        ]),
      },
    });
    assert.notEqual(result.status, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
