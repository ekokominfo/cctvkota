# Deployment Proxmox / aaPanel

Template ini belum diterapkan ke produksi. Domain publik belum ditentukan.
Tidak ada perubahan MikroTik, NVR, aaPanel atau Proxmox yang dilakukan otomatis.

## VM dan jaringan

Dianjurkan VM Debian/Ubuntu, Docker Engine + Compose plugin, sinkronisasi NTP,
4 vCPU / 8 GB RAM / SSD 40 GB sebagai titik awal, ukur ulang sesuai bitrate.
LXC memerlukan nesting/cgroup yang didukung administrator Proxmox; VM mengurangi
kerumitan Docker-in-LXC. Tidak perlu container privileged untuk aplikasi.

Pastikan akses VM ingest ke NVR LAN2 172.16.10.7 melalui routing yang sudah ada.
MikroTik 1: publik 103.85.57.126 / LAN 192.168.7.1; MikroTik 2A: WAN
192.168.7.253 / LAN 172.16.10.1/24. NVR HTTP 8081 bukan RTSP.
Jangan mengubah gateway NVR demi memasang aplikasi. Uji setiap rute dengan izin.

aaPanel 172.16.10.2 dapat berada pada host sama atau host berbeda dari aplikasi.
Default Compose bind web 127.0.0.1:3000 **hanya** bekerja bila Nginx di host sama.
Bila beda VM: buat override Compose `web.ports: !override ["IP_VM_PRIVAT:3000:3000"]`
(dibutuhkan Compose modern), firewall port 3000 hanya dari 172.16.10.2 dan arahkan
upstream Nginx ke IP VM privat. Jangan bind 0.0.0.0 tanpa firewall terverifikasi.
Tidak mengizinkan port DB, RTSP, HLS internal atau API MediaMTX dari internet.

## Instalasi

```sh
npm ci
node scripts/init-local.mjs
```

Edit `.env` melalui terminal privat: `NODE_ENV=production`,
`APP_ORIGIN=https://DOMAIN_YANG_DIPILIH` tanpa trailing slash. Gunakan password DB
hex/alphanumeric agar URL PostgreSQL aman; bila memakai karakter khusus URL-encode
password di connection string atau gunakan secret manager dengan DATABASE_URL
utuh. Simpan `MFA_ENCRYPTION_KEY` terpisah dan jangan rotasi tanpa reenkripsi TOTP.
Konfigurasi Compose menetapkan production dan menolak APP_ORIGIN non-HTTPS.

```sh
docker compose build
docker compose up -d db mediamtx migrate api web
# Output hanya readiness, tidak memuat rahasia:
docker compose ps
```

Compose menjalankan migrasi sebelum API; volume pgdata persisten. Setelah restore
snapshot/machine baru, proses tetap harus di-start ulang. Jangan jalankan override
dev di produksi. Profile `demo` opsional untuk test pattern; tidak menyentuh NVR.
Untuk cloud build di balik TLS proxy, gunakan BuildKit secret CA sesuai
`compose.cloud.yml`, bukan menonaktifkan TLS verification.

Provision admin dari shell privat, tanpa password di argv atau commit:

```sh
# Export BOOTSTRAP_ADMIN_EMAIL dan BOOTSTRAP_ADMIN_PASSWORD dari secret manager.
docker compose run --rm -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD api node apps/api/dist/admin.js
```

URI TOTP ditampilkan sekali ke terminal privat. Impor ke authenticator sebelum
menghapus output. Akun viewer dibuat melalui panel admin. Tidak ada akun bawaan.
Langkah ingest NVR terpisah: [hikvision.md](hikvision.md).

## HTTPS aaPanel

Pilih domain; arahkan DNS ke IP publik sesuai kebijakan operator. Setelah izin,
operator dapat menerapkan NAT 80/443 hanya ke reverse proxy dan firewall sesuai
topologi aktual. Jangan otomatis menambah aturan MikroTik. Buat situs Nginx di
aaPanel, terbitkan sertifikat ACME valid dan aktifkan perpanjangan otomatis.
Gunakan [template Nginx](../infra/nginx/cctv.conf.example); tambahkan limit zone di
`http{}`, ganti placeholder domain/cert, cek `nginx -t` sebelum reload. Cadangkan
vhost lama. Jangan membuat dua server{} yang konflik dengan vhost aaPanel.

Tidak boleh caching/CDN untuk `/api/*`, khususnya playlist dan seluruh segmen HLS.
Matikan aaPanel video/static caching regex yang dapat mengambil prioritas route.
Uji dari luar: HTTPS valid, HTTP redirect, cookie Secure/HttpOnly/SameSite,
private playlist/init/segmen ditolak ketika URL dibagikan ke incognito. Uji ulang
setelah logout dan revoke grant. Pastikan 5432,8554,8888,9997 tidak dapat diakses
publik. Jangan membuka aaPanel management ke semua internet.

## Health, backup, maintenance

- `/api/health` memeriksa DB (503 jika gagal). Kamera mendapat online/offline dari
  MediaMTX tiap 15s; kegagalan monitor menghasilkan unknown, bukan online palsu.
  Status sumber siap tidak menjamin browser dapat decode; uji playback nyata.
- `docker compose logs --tail 100 api web` untuk aplikasi. Log ingest rahasia;
  jangan memublikasikan output MediaMTX. Pasang rotasi log Docker dan alarm disk.
- `BACKUP_DIR=/path/aman ./scripts/backup.sh` membuat pg_dump custom-format 0600.
  Jadwalkan harian; enkripsi dan salin off-host, retention 7 harian/4 mingguan,
  target awal RPO 24h. Cadangkan .env dan config NVR secara terenkripsi, terpisah.
- Uji restore ke DB terisolasi: `createdb` di host test, lalu
  `pg_restore --no-owner --no-acl --dbname=DB_TEST file.dump`. Jangan restore
  langsung ke DB aktif. Verifikasi login MFA dan grant setelah restore.
- Sesi/login attempts dibersihkan otomatis. Audit tidak dihapus otomatis; tentukan
  retention (misalnya 180 hari) sesuai kebijakan, ekspor aman dan prune terjadwal.
- Pembaruan: backup → pin/review dependencies dan image digest → CI → staging
  stream dummy → jadwal maintenance → build/up. Rollback image sebelumnya;
  migrasi masa depan harus didesain kompatibel dan dites restore.
- Scaling: API stateless dengan sesi/limit login di PostgreSQL; rate HLS umum dan
  concurrency lokal per replica. Tambahkan limiter terdistribusi sebelum banyak
  replica. Jangan scale ingest sembarang (akan menggandakan koneksi NVR).
- Bandwidth kira-kira jumlah kamera × bitrate × penonton serentak. 16 substream
  0.5 Mbps ≈8 Mbps tiap viewer ditambah overhead. Matikan player tak terpakai;
  default tidak autoplay seluruh grid. CDN privat belum didukung.

## Kriteria go-live yang belum dapat dibuktikan lokal

Domain/sertifikat valid, rute NVR LAN1/LAN2, read-only account, codec/GOP, ACL
firewall/NAT, restore off-host, MFA recovery, retensi audit dan uji soak pada VM
tujuan harus diverifikasi operator. Approval perangkat produksi tetap diperlukan.
