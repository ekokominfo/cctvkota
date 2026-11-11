# Security model dan review

## Kontrol yang diimplementasikan

- Kamera default privat, public approval explicit dan tercatat. API read memakai
  allowlist kolom; path internal tidak pernah dikirim ke penonton. API admin tidak
  menerima URL RTSP sehingga tidak dapat menjadi SSRF proxy.
- RBAC dua role: admin mengelola semua kamera; viewer hanya public atau grant
  eksplisit. Kamera disabled tidak dapat dilihat siapa pun. Perubahan user/revoke
  grant dievaluasi ulang pada permintaan berikutnya. Manipulasi kamera/user/grant
  dan audit log menggunakan transaksi PostgreSQL yang sama.
- Sesi random 256-bit, hanya hash SHA-256 disimpan, umur absolut 8 jam, HttpOnly,
  SameSite Strict, Secure wajib di production. Logout/deaktivasi/reset password
  menghapus sesi server-side. Token sesi dan CSRF tidak disimpan localStorage.
- Password scrypt N=32768,r=8,p=3, salt random 128-bit, hash 512-bit;
  perbandingan constant-time. Tidak ada password atau akun default.
- Admin wajib TOTP SHA1 6 digit/30s; toleransi ±1 step, replay protection step
  monotonic disimpan DB dengan row lock. Secret TOTP terenkripsi AES-256-GCM,
  kunci 32-byte server-only; NTP harus benar. CLI bootstrap hanya dari terminal
  privat, URI enrollment adalah rahasia dan tidak dikirim lewat API publik.
- Origin exact + synchronizer CSRF token pada setiap mutation authenticated.
  Login juga wajib Origin exact untuk mencegah login CSRF. Tidak mengaktifkan CORS.
- Limit login persisten PostgreSQL lintas replica: 10/account dan 100/source IP
  dalam 15 menit; window tidak bergantung proses API. Tambahan rate limit HTTP
  memory per replica. IP proxy tidak dipercaya: API tidak memakai XFF dari klien;
  Nginx menerapkan limit IP pengguna di edge. Banyak user berbagi source IP API
  (Next.js); limit account tetap independen, limit IP backend agregat.
- Semua playlist master/media, init, .mp4/.m4s/.ts dan HEAD melewati otorisasi.
  Tidak ada signed URL yang menjadi bearer grant atau endpoint direct MediaMTX.
  Path ketat satu filename, query whitelist, no redirects, playlist URI relatif
  tervalidasi, range tunggal tervalidasi, timeout upstream, concurrency cap 256.
- Cache-Control private,no-store serta CDN-Cache-Control/Surrogate-Control no-store
  untuk HLS, Vary Cookie dan same-origin resource policy. Nginx tidak cache API.
- Body terbatas 16 KiB, input Zod strict, SQL parameterized, no raw error response,
  header Helmet, CSP nonce per response (script strict-dynamic) dan header Next, no frame embedding, media hanya same origin.
- Tidak ada public bind RTSP/HLS/API MediaMTX/DB di Compose production.
  NVR ingest server-only, config 0600 di luar source dan build context.

## Bukti dan batas

Tes integrasi memakai PostgreSQL nyata dan HTTP upstream sintetis, bukan hasil
mock otorisasi. Browser smoke memakai FFmpeg → RTSP MediaMTX → HLS API → hls.js
untuk decode public/private video. Lihat [hasil validasi](validation.md).
URL privat yang disalin tanpa sesi/izin harus selalu ditolak. Saat grant dicabut,
segmen berikutnya ditolak; byte yang sudah diterima dan buffer browser tidak dapat
ditarik kembali. DVR/rekaman, watermark, kontrol screenshot dan DRM bukan fitur MVP.

Konfigurasi reverse proxy/CDN yang salah dapat mengalahkan no-store. Tes dengan
HTTPS aktual, dua akun dan incognito wajib dilakukan setelah aaPanel diterapkan.
Rate limiter HLS global belum distributed; pasang edge quotas/egress budget dan
limiter terdistribusi sebelum scale banyak replica. Public traffic tetap dapat
menghabiskan bandwidth; ini bukan mitigasi DDoS lengkap.

MFA enrollment/recovery via CLI membutuhkan host terpercaya; belum ada self-service
recovery atau WebAuthn. Tidak ada password recovery email. Tetapkan prosedur dua
operator, audit akses DB dan backup key sebelum go-live. Secret rotasi memerlukan
reenkripsi dengan key lama; jangan mengganti key begitu saja.

Review kode dan npm audit lokal bukan penetration test independen. Scan image,
review secret manager, backup restore, firewall eksternal, domain/sertifikat,
retensi data, izin tayang publik dan uji soak NVR/VM tetap perlu sebelum produksi.

## Checklist pemeriksaan operator

1. HTTPS sertifikat valid, redirect HTTP, cookie Secure dan origin persis domain.
2. Incognito tidak mendapat kamera privat, URL master/media/init/segmen/HEAD 404.
3. Viewer A tidak dapat memakai grant viewer B; revoke dan logout menghentikan
   permintaan baru. Disabled kamera/user tidak tetap tampil online/tayang.
4. Tidak ada media privat pada cache Nginx/CDN/browser disk atau service worker.
5. Port 5432/8554/8888/9997/NVR tidak terbuka publik. Tidak ada header upstream
   atau log yang membocorkan URL RTSP/kredensial.
6. Akun NVR read-only, channel terbatas; satu koneksi per kamera teramati di NVR.
7. Uji restore terenkripsi di lingkungan terisolasi, MFA, grant dan audit utuh.

## Dependency review pada pengerjaan ini

Audit production dependencies: 0 temuan. Full development tree memiliki 7 temuan
moderate yang semuanya berasal dari minimatch 10.x pada typescript-eslint
([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)).
Lint menerima pola repositori terpercaya, bukan input HTTP pengguna. Tidak memaksa
override major minimatch atau downgrade parser untuk menyembunyikan laporan.
Runtime Docker menghapus dev dependencies setelah build. Perbarui parser ketika
upstream mendukung versi minimatch yang diperbaiki; jalankan audit kembali pada
setiap pembaruan. Tidak ada high/critical yang terlapor pada audit saat ini.
