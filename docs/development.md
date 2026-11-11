# Pengembangan lokal

Node.js >=22.21, npm, Docker Engine dan Compose v2. VM Linux dianjurkan.
Pakai checkout yang ada; task cloud sudah terisolasi, jangan membuat worktree tambahan.

```sh
npm ci
node scripts/init-local.mjs # hanya sekali, menolak overwrite .env
# Infrastruktur saja; jangan start web/api Compose pada mode development host.
docker compose -f compose.yml -f compose.dev.yml up -d db mediamtx
set -a; . ./.env; set +a
npm run db:migrate
npx tsx apps/api/src/demo.ts
npm run dev:api
# Terminal lain dengan environment .env yang sama:
npm run dev:web
```

Generator dummy tanpa NVR (FFmpeg host):
```sh
ffmpeg -re -f lavfi -i testsrc2=size=1280x720:rate=15 \
 -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -g 30 \
 -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/demo
```
Atau `docker compose --profile demo -f compose.yml -f compose.dev.yml up -d dummy`.
Konfigurasi demo hanya untuk data sintetis; tidak mengaktifkan akses publik NVR.

Buat administrator dari terminal privat, gunakan password >=14 karakter:
```sh
# Masukkan BOOTSTRAP_ADMIN_EMAIL dan BOOTSTRAP_ADMIN_PASSWORD melalui secret
# manager / environment terminal; jangan memasukkannya ke Git atau riwayat shell.
npm run admin:create
```
Perintah menampilkan URI TOTP rahasia satu kali. Impor melalui authenticator,
simpan di password manager dan hapus output terminal bersama password bootstrap.
Login admin selalu memerlukan TOTP; tidak ada password default atau bypass MFA.
Untuk pemulihan kehilangan MFA, operator dengan akses DB harus mencabut semua
sesi admin dan memasang secret TOTP baru terenkripsi memakai prosedur terkontrol.

```sh
npm run lint
npm run typecheck
npm test # membutuhkan PostgreSQL test; lihat scripts/test-local.sh
npm run build
```
Tes integrasi menghapus isi DB test. Gunakan DATABASE_URL khusus test dan
`ALLOW_TEST_DATABASE_RESET=1`, tidak pernah database produksi.
`npm test` tanpa flag gagal secara sengaja, bukan diam-diam skip.
