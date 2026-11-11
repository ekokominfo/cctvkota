# Hasil validasi lokal

Tanggal: 11 November 2026 (WIB). Lingkungan cloud Linux, Node 24.22.1, Docker
29.9.2 / Compose 2.40.3, PostgreSQL 17.6, MediaMTX 1.15.6, Chromium sistem.
Tidak mengakses atau mengubah MikroTik, Proxmox, aaPanel produksi atau NVR.

## Lulus

- `npm ci` menggunakan package-lock; lint ESLint dan typecheck mencakup API,
  Next.js, test API dan skrip browser. Build produksi API/Next.js berhasil.
- 2 tes renderer NVR: URL encoding credential ephemeral (bukan kredensial nyata),
  file mode0600, no-publish, penolakan overwrite dan ingest channel duplikat.
- 16 tes integrasi API dengan PostgreSQL nyata: publik/private allowlist, playlist
  master/media/init/MP4/M4S/TS/HEAD, shared URL, viewer/admin RBAC, grant/revoke,
  user disabled, expired session, logout cookie replay, CSRF/Origin, input/SSRF,
  TOTP wajib dan anti-replay, login limit persistent, CRUD dan audit.
- Browser smoke: FFmpeg → MediaMTX RTSP → fMP4 HLS → API → hls.js. Public dan
  private video menunjukkan currentTime maju >1s dan decode nyata. Login MFA,
  tambah kamera via UI, penolakan URL private incognito, logout, theme dan mobile
  390px tanpa overflow lulus; tidak ada uncaught JavaScript error.
- CSP nonce ada pada response serta script HTML dan berubah tiap request;
  production tidak mengizinkan unsafe-inline script. Browser diuji ulang sesudahnya.
- Backup pg_dump mode0600 berhasil dipulihkan ke database terisolasi. Kamera demo
  dan versi migrasi cocok. DB restore uji kemudian dihapus, data asal utuh.
- Stack Compose produksi terisolasi berhasil start: migrasi, API, frontend, DB,
  MediaMTX dan profile dummy. HLS diprobe sebagai H.264 1280×720; DB dan MediaMTX
  tidak mempunyai port host publik. Dev parser tidak ada di runtime image.
- Template Nginx diuji dengan `nginx -t` dan proxy TLS lokal menggunakan CA test
  yang dipercaya klien (verifikasi sertifikat tetap aktif). Bootstrap admin compiled,
  login TOTP, cookie Secure/HttpOnly/SameSite, CSP nonce, akses admin dan CSRF logout
  berhasil. HTTP redirect301. Ini bukan sertifikat/domain aaPanel produksi.
- Audit production dependencies: 0 temuan. Full dev tree: 7 moderate terkait
  minimatch/typescript-eslint, 0 high/critical. Detail di security.md.

## Beban 16 player sintetis

Chromium viewport1920×2200 (seluruh player terlihat), 16 path MediaMTX berbeda,
masing-masing relay sumber testsrc2 H.264 1280×720 15fps. Satu publisher FFmpeg
mendasari semua relay; bukan 16 koneksi kamera fisik atau 16 encode terpisah.

Pengukuran sekitar30s, 464 respons HLS, 0 error HTTP/JavaScript, p95 waktu menuju
awal respons sekitar353ms. Seluruh16 video time maju >23s dan total359–368 frame
per video; dropped6–10 frame per video. Header Content-Length tidak selalu ada
pada respons chunked sehingga tidak digunakan sebagai pengukuran total bandwidth.

Uji awal hanya8 player terdecode. Uji ulang dengan viewport memuat seluruh grid
serta tanpa restart API development berhasil16. Penyebab awal tidak diisolasi
sebagai satu faktor; hasil ini tidak menggantikan soak test VM/browser tujuan.

Artefak lokal di `artifacts/`: dashboard-desktop.png, dashboard-mobile.png,
load-16.png dan load-16.json. Diabaikan Git agar hasil test tidak menjadi sumber.
Jalankan ulang dengan workflow di development.md, bukan pada produksi.

## Belum diverifikasi / tindakan operator

- NVR Hikvision, akun read-only dan codec/GOP aktual; rute kedua LAN, satu sesi
  ingest fisik per kamera, pemulihan koneksi saat NVR offline.
- Domain publik, ACME/HTTPS di aaPanel, firewall/NAT dan port scan eksternal.
- Penetration test independen, image CVE scan, soak/load multi-viewer pada VM
  Proxmox sebenarnya, bandwidth WAN serta backup/restore off-host terenkripsi.
- WebRTC, rekaman/DVR dan recovery MFA self-service bukan fitur MVP ini.

Repository berisi implementasi dan template Fase1–8; Fase6/7 hanya persiapan
integrasi produksi dan deployment. Tidak mengklaim produksi sudah diterapkan.
