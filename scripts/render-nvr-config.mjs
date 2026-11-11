// Run only on the trusted ingest host with server-side environment secrets.
import { writeFile, mkdir } from 'node:fs/promises';
import { isIP } from 'node:net';
const required = ['NVR_HOST', 'NVR_USERNAME', 'NVR_PASSWORD', 'NVR_CHANNELS'];
if (required.some((k) => !process.env[k]))
  throw new Error(`Required server-only variables: ${required.join(', ')}`);
const host = process.env.NVR_HOST,
  port = Number(process.env.NVR_RTSP_PORT || 554);
if (isIP(host) !== 4 || !Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Expected validated IPv4 host and RTSP port');
const channels = JSON.parse(process.env.NVR_CHANNELS);
if (!Array.isArray(channels) || !channels.length || channels.length > 64)
  throw new Error('NVR_CHANNELS must be a non-empty array, max 64');
const paths = {};
const ids = new Set();
for (const c of channels) {
  if (
    !c ||
    !/^cam_[a-zA-Z0-9_-]{1,70}$/.test(c.path) ||
    !/^\d{1,3}0[12]$/.test(c.channel) ||
    ids.has(c.channel) ||
    paths[c.path]
  )
    throw new Error(
      'Unique cam_* paths and unique Hikvision channel IDs (101/102/201/202...) required',
    );
  ids.add(c.channel);
  const url = new URL(`rtsp://${host}:${port}/Streaming/Channels/${c.channel}`);
  url.username = process.env.NVR_USERNAME;
  url.password = process.env.NVR_PASSWORD;
  paths[c.path] = { source: url.toString(), sourceOnDemand: false, rtspTransport: 'tcp' };
}
const cfg = {
  logLevel: 'error',
  api: true,
  apiAddress: ':9997',
  rtsp: true,
  rtspAddress: ':8554',
  rtspTransports: ['tcp'],
  rtmp: false,
  srt: false,
  webrtc: false,
  hls: true,
  hlsAddress: ':8888',
  hlsVariant: 'fmp4',
  hlsAlwaysRemux: true,
  hlsSegmentDuration: '2s',
  hlsSegmentCount: 7,
  hlsAllowOrigins: [],
  authInternalUsers: [{ user: 'any', permissions: [{ action: 'read' }, { action: 'api' }] }],
  paths,
};
await mkdir('secrets', { recursive: true, mode: 0o700 });
await writeFile('secrets/mediamtx.yml', JSON.stringify(cfg, null, 2), { flag: 'wx', mode: 0o600 });
console.log(
  'Private MediaMTX configuration created; no credentials printed. Existing files are never overwritten.',
);
