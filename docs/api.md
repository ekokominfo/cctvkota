# API MVP

Satu origin dengan frontend; tidak ada CORS. Semua respons API no-store.
Sesi cookie HttpOnly. Semua mutation wajib header `Origin` persis `APP_ORIGIN`;
selain login wajib `X-CSRF-Token` dari login/me. Role tidak diterima dari browser.

| Metode   | Path                     | Izin / fungsi                                                              |
| -------- | ------------------------ | -------------------------------------------------------------------------- |
| GET      | `/api/health`            | Readiness DB, 503 jika gagal                                               |
| POST     | `/api/auth/login`        | `{email,password,otp?}`; admin wajib OTP; hasil user+csrf, Set-Cookie      |
| GET      | `/api/auth/me`           | user+csrf aktif atau null                                                  |
| POST     | `/api/auth/logout`       | Sesi+CSRF; hapus sesi dan cookie                                           |
| GET      | `/api/cameras`           | Publik approved atau kamera sesuai grant/admin; tidak mengirim stream_path |
| GET/HEAD | `/api/streams/:id/:file` | Ulangi otorisasi setiap objek HLS; 404 jika tidak tersedia/berizin         |
| GET      | `/api/admin/cameras`     | Admin: termasuk disabled dan path internal                                 |
| POST     | `/api/admin/cameras`     | Admin: buat kamera, default privat                                         |
| PUT      | `/api/admin/cameras/:id` | Admin: ganti konfigurasi lengkap                                           |
| DELETE   | `/api/admin/cameras/:id` | Admin: hapus kamera dan grant                                              |
| GET/POST | `/api/admin/users`       | Admin: daftar user / buat role user saja `{email,password}`                |
| PUT      | `/api/admin/users/:id`   | Admin: `{enabled,password?}`; viewer saja, cabut sesi                      |
| GET      | `/api/admin/grants`      | Admin: daftar user_id/camera_id                                            |
| PUT      | `/api/admin/grants`      | Admin: `{cameraId,userId,allowed}` idempotent                              |
| GET      | `/api/admin/audit`       | Admin: 200 event terbaru                                                   |

Payload kamera: `{name,location,streamPath,enabled?,publicApproved?,latitude?,longitude?}`.
Nama max100, lokasi max200; streamPath `[a-zA-Z0-9_-]{1,80}` dan unik.
Latitude/longitude nullable, rentang -90..90 / -180..180. Tidak menerima RTSP URL,
username/password NVR atau field lain. Public approval hanya perubahan admin.
Password user baru/reset minimal14 maksimal128 karakter. Admin baru via CLI MFA.

Status API: 400 input tidak valid, 401 login tidak valid, 403 role/CSRF/origin
tertutup, 404 stream tidak ditemukan/berizin, 409 nilai unik duplikat, 429 limit,
502 upstream gagal, 503 DB/kapasitas stream. Detail SQL/URL NVR tidak dikirim.

HLS resource satu filename .m3u8/.mp4/.m4s/.ts. Range hanya `bytes=start-end` tunggal.
Query hanya `_HLS_msn`, `_HLS_part`, `_HLS_skip` valid; fMP4 non-LL dipilih agar
lebih sederhana. Playlist dengan URI absolute/traversal ditolak, bukan diteruskan.
