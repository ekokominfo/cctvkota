import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const password = randomBytes(24).toString('hex');
const contents = `POSTGRES_DB=cctv\nPOSTGRES_USER=cctv\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://cctv:${password}@127.0.0.1:5432/cctv\nAPP_ORIGIN=http://localhost:3000\nHOST=127.0.0.1\nPORT=4000\nNODE_ENV=development\nMFA_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\nMEDIAMTX_HLS_URL=http://127.0.0.1:8888\nMEDIAMTX_API_URL=http://127.0.0.1:9997\nAPI_INTERNAL_URL=http://127.0.0.1:4000\nMEDIAMTX_CONFIG=./infra/mediamtx/mediamtx.yml\n`;
await writeFile('.env', contents, { flag: 'wx', mode: 0o600 });
console.log(
  'Created private local .env with random secrets. Existing files are never overwritten.',
);
