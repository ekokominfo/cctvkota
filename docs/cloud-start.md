# Startup cloud development

Task cloud sudah terisolasi. Gunakan checkout `/workspace/cctvkota` yang tersedia;
jangan buat worktree baru kecuali diminta. Tidak menyentuh perangkat produksi.

Setup yang dapat diulang:

```sh
./scripts/cloud-install.sh
```

Skrip memakai lockfile, menolak environment non-local, menjaga .env yang sudah ada,
menyalakan DB/MediaMTX/dummy development dan migrasi idempotent. Rahasia lokal
dibuat random hanya jika .env belum ada. Cache npm berada di /workspace/.npm-cache
karena home cloud dapat read-only. Proses harus dimulai ulang setelah snapshot.

Dari root repositori, muat .env lokal terpercaya tanpa mencetak isinya, lalu mulai
`npm run dev:api` dan `npm run dev:web` di dua sesi terpisah. Port API4000 dan
web3000; infrastruktur Compose dipastikan hidup oleh skrip install. Jangan
jalankan proses kedua pada port yang sudah dipakai.

Readiness: GET `/api/health` melalui frontend, GET `/api/cameras`, ambil demo master
playlist, referenced media playlist dan segmen. Uji browser melalui langkah
[development.md](development.md). Tidak ada akun administrator default; provisioning
CLI wajib MFA dan enrollment URI rahasia. Test fixture browser menangani admin
sementara secara otomatis.

Penyimpanan `install_script` dan `start_skill` ke draft cloud dicoba, tetapi layanan
mengembalikan INVALID_ARGUMENT dan konfirmasi penyimpanan tidak tersedia. Berkas
ini dan helper tersimpan dalam Git sebagai fallback; tidak mengklaim draft atau
snapshot sudah dipublikasikan. Publication dilakukan melalui produk oleh pengguna.
