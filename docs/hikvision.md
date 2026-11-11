# Integrasi Hikvision — langkah operator, belum diaktifkan

Jangan ubah gateway atau routing NVR. Tidak ada koneksi menuju jaringan produksi
yang dijalankan oleh setup/test repositori ini.

1. Setelah izin eksplisit, dari VM ingest uji akses ke NVR LAN2 `172.16.10.7`.
   Konfirmasi port RTSP (biasanya 554) melalui operator; HTTP 8081 terpisah.
   NVR LAN1 melalui MikroTik 2B/OLT/ONT membutuhkan alamat dan rute terverifikasi.
2. Buat akun NVR khusus read-only/live-view dengan hanya kanal yang dibutuhkan.
   Jangan gunakan admin NVR. Jangan masukkan username/password di browser.
3. Gunakan substream H.264, misalnya 640×360 atau 1280×720, 10–15 fps, GOP 1–2s.
   H.265 tidak didukung merata browser; MediaMTX tidak melakukan transcoding.
   Audio, jika dipakai, gunakan codec yang didukung browser dan kebijakan privasi.
4. Inject `NVR_HOST`, `NVR_RTSP_PORT`, `NVR_USERNAME`, `NVR_PASSWORD` dari secret
   manager ke terminal server. `NVR_CHANNELS` adalah JSON nonrahasia contoh:
   `[{"path":"cam_lan2_01","channel":"102"},{"path":"cam_lan2_02","channel":"202"}]`.
   `101` main stream channel 1; `102` substream channel 1. Konfirmasi model NVR.
5. Dari root repositori jalankan `node scripts/render-nvr-config.mjs`.
   Output `secrets/mediamtx.yml` mode 0600, folder 0700, diabaikan Git dan Docker
   build context. Tidak mencetak URL berkredensial. Skrip menolak overwrite.
6. Set `MEDIAMTX_CONFIG=./secrets/mediamtx.yml` pada `.env`; kosongkan variabel
   kredensial NVR dari terminal setelah render. Terapkan container MediaMTX baru
   setelah izin operator; API hanya menyimpan path seperti `cam_lan2_01`.
7. Tambahkan kamera melalui panel admin: path sama, private/default. Berikan izin
   user dan uji playlist/segmen dengan dua akun sebelum menyetujui kamera publik.
8. Verifikasi pada NVR ada satu sesi ingest per path, bukan per penonton.
   Duplikasi channel ditolak oleh renderer; jangan menjalankan dua instance ingest
   untuk kamera sama tanpa perencanaan failover.

Konfigurasi multi-NVR: render tiap NVR di tempat aman, gabungkan objek `paths`
dalam satu berkas rahasia dengan path unik (jangan tampilkan berkas ke chat/log).
MediaMTX logLevel error mengurangi keluaran, tetapi log ingest masih harus dianggap
sensitif: error upstream dapat memuat alamat atau kredensial. Batasi akses log dan
backup, jangan kirim log mentah. Rotasi password read-only dengan mengganti konfigurasi
rahasia secara atomik dan restart ingest pada jendela pemeliharaan.

Publikasi aplikasi HTTPS tidak memerlukan publikasi RTSP, API MediaMTX, HLS internal,
HTTP NVR 8081 atau aaPanel admin. Jangan tambah port-forward untuk layanan tersebut.
