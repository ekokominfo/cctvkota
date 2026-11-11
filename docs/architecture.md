# Arsitektur dan batas kepercayaan

Browser → HTTPS aaPanel Nginx → Next.js → API Node.js → PostgreSQL.
Setiap permintaan `/api/streams/:cameraId/*` melalui API untuk otorisasi ulang,
kemudian API mengambil objek HLS dari MediaMTX melalui jaringan streaming privat.
Tidak ada URL RTSP, kredensial NVR, atau URL internal MediaMTX di respons browser.
Sesi opaque disimpan sebagai hash SHA-256 di PostgreSQL. Admin wajib TOTP.

MediaMTX menarik satu RTSP per path kamera dengan koneksi TCP (always-on), lalu
mendistribusikan fMP4 HLS. Tidak membuat koneksi NVR per penonton. Setiap kamera
fisik harus mempunyai satu path unik; DB menolak stream path duplikat.
WebRTC dimatikan; implementasi berikutnya harus melindungi signaling dan media.

Jaringan Docker: backend internal (DB/API/web), streaming internal (API/MediaMTX),
ingest (MediaMTX menuju NVR), edge (web menuju reverse proxy). Hanya web bind
loopback host. Compose dev sengaja membuka DB dan stream hanya ke loopback.

Tidak mengubah MikroTik, Proxmox, aaPanel, atau NVR. Rute yang sudah ada harus
diuji terpisah sebelum ingest: server aplikasi → 172.16.10.7 RTSP (umumnya 554).
Port HTTP NVR 8081 bukan port RTSP. IP publik 103.85.57.126 bukan target RTSP.
Alamat NVR LAN 1 belum diketahui dan tidak diasumsikan.

## Tahapan

1. Struktur, Compose dan dokumen.
2. Migrasi DB, autentikasi, RBAC, API dan audit.
3. Stream dummy MediaMTX untuk verifikasi tanpa NVR.
4. Dashboard publik/privat serta admin.
5. Proxy HLS berotorisasi untuk playlist dan semua objek media; uji negatif.
6. Konfigurasi ingest Hikvision rahasia (aktivasi membutuhkan akses dan persetujuan).
7. Template HTTPS aaPanel, backup dan operasi Proxmox (tidak diterapkan otomatis).
8. Review dan beban lokal 16 kamera, laporkan batas bukti.
