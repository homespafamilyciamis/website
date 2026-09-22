# Vercel Deployment — Home Spa Family Website

Repo: `https://github.com/homespafamilyciamis/website` (branch `main`)
Output: folder `public/` (lihat `vercel.json`)
API: `api/*.js` serverless (chat Eva + booking + otomasi WhatsApp)
DB: Supabase project `kyxqufvwvofdaohqlknf`, tabel `public.bookings`, `public.customers`,
`public.wa_outbox`, `public.broadcasts`, `public.analytics_reports`, `public.automation_rules`
(lihat `supabase.sql`)

## A. Hubungkan Vercel ↔ GitHub (sekali saja)

1. Buka https://vercel.com → login dengan akun GitHub **homespafamilyciamis**.
2. **Add New → Project → Import** repository `homespafamilyciamis/website`.
3. Pada form Configure Project, biarkan sesuai `vercel.json`:
   - Framework Preset: **Other**
   - Build Command: kosongkan (tidak ada build step)
   - Output Directory: `public`
4. JANGAN klik Deploy dulu — isi Environment Variables di bawah, baru Deploy.

## B. Environment Variables (wajib, Production + Preview + Development)

Buka project → **Settings → Environment Variables**, tambahkan:

| Key | Nilai | Keterangan |
|---|---|---|
| `GEMINI_API_KEY` | (kunci Gemini Anda) | Sudah ada — jangan diubah. Dipakai `api/chat.js` (Eva). |
| `SUPABASE_URL` | `https://kyxqufvwvofdaohqlknf.supabase.co` | Dipakai semua store (`bookingStore.js`, dll). |
| `SUPABASE_SERVICE_ROLE_KEY` | (secret — dari Supabase Dashboard → Settings → API) | **WAJIB.** RLS aktif di semua tabel; hanya service_role yang bisa akses dari backend. |
| `ADMIN_KEY` | `e50f53aa53d13d69ad6dff1ac0b7a0b8522653a17d371050` | Kunci login `/admin`. Samakan dengan `.env` lokal. |
| `WHATSAPP_NUMBER` | `6285126246175` | Nomor admin untuk link WA. |
| `NODE_ENV` | `production` | Standar. |
| `SUPABASE_ANON_KEY` | (lama) | Tidak dipakai lagi oleh backend — RLS aktif membuat anon key tidak punya akses. Biarkan saja. |

> Nilai `SUPABASE_*` dan `ADMIN_KEY` di atas sama persis dengan `.env` lokal
> (file `.env` TIDAK ikut commit — hanya `.env.example` yang ada di git).

Setelah semua terisi → **Deploy** (atau **Redeploy** jika project sudah ada).

## C. Verifikasi "terhubung penuh" (checklist)

1. **Deployments** hijau (Ready), bukan Error.
2. Buka URL produksi, mis. `https://website-xxx.vercel.app`:
   - `/` tampil (landing + form booking).
   - `/admin` tampil (login ADMIN_KEY).
   - `/api/health` → `{"success":true,"storage":"supabase"}`.
3. Test booking dari website → cek baris baru di Supabase
   **Table Editor → bookings**, dan muncul di `/admin`.
4. Test chat Eva → dapat balasan (bukan pesan error konfigurasi).
5. Setiap `git push origin main` → muncul deployment baru otomatis di tab
   **Deployments** (artinya webhook GitHub ↔ Vercel jalan).

## D. Otomasi WhatsApp & Portal Admin (fitur baru — WAJIB dilakukan sekali)

### E1. Jalankan SQL baru di Supabase (WAJIB sebelum deploy)

Fitur otomasi butuh tabel & fungsi baru. Tanpa ini, tab Pelanggan/Follow-up/
Broadcast/Laporan AI akan error "Could not find the table ... in the schema cache".

1. Buka https://supabase.com → project **kyxqufvwvofdaohqlknf** (Home Spa Family).
2. **SQL Editor → New query**.
3. Salin SELURUH isi `supabase.sql` dari repo (atau minimal bagian tabel baru:
   `customers`, `wa_outbox`, `broadcasts`, `analytics_reports`, `automation_rules`,
   fungsi `hsf_normalize_wa`, `hsf_recalc_customer`, `hsf_refresh_segments`,
   trigger sinkron booking/chat → customers, dan semua view `v_*`).
4. **Run**. Pastikan tidak ada error, lalu cek **Table Editor** — tabel baru harus muncul.

> Trigger otomatis mengisi `customers` dari setiap booking/chat baru.
> Data lama tidak dipindahkan otomatis; segmen akan terisi saat `hsf_refresh_segments`
> dijalankan (tombol "Segarkan segmen" di tab Pelanggan /admin).

### E2. Environment Variables baru di Vercel

Tambahkan di **Settings → Environment Variables** (Production + Preview):

| Key | Nilai | Keterangan |
|---|---|---|
| `CRON_SECRET` | (string acak panjang, buat sendiri) | Wajib. Verifikasi pemanggil cron `/api/cron/daily` & `/api/cron/weekly` (Vercel kirim `Authorization: Bearer`). |
| `FONNTE_TOKEN_BROADCAST` | token device Fonnte kedua (opsional) | Disarankan: device khusus broadcast agar nomor CS tidak terlihat mengirim massal. Kosong = pakai `FONNTE_TOKEN`. |
| `FONNTE_JEDA` | `8-20` | Jeda acak antar nomor (detik) dalam 1 batch. |
| `FONNTE_MAX_TARGET` | `25` | Maks nomor per request Fonnte. |
| `WA_LIMIT_KIRIM` | `40` | Maks pesan dikirim per jalan cron. |
| `WA_JAM_MULAI` / `WA_JAM_SELESAI` | `8` / `20` | Jam aman kirim (WIB). Di luar jam ini pengiriman ditunda. |
| `WA_LAPORAN_HARIAN` | `1` | `0` = matikan laporan harian ke grup. |
| `WA_NOMOR_DIKECUALIKAN` | `628xxx,628yyy` | Nomor tambahan yang TIDAK boleh dihubungi otomasi. |

> `FONNTE_TOKEN` & `WA_GROUP_ID` sudah ada. Jangan dihapus — dipakai Eva & laporan grup.

### E3. Tambah domain `admin.homespafamily.my.id` di Vercel

1. Vercel → project → **Settings → Domains → Add** → `admin.homespafamily.my.id`.
2. DNS (registrar `.my.id`) sudah mengarah ke Vercel; setelah ditambahkan di Vercel,
   tunggu sertifikat terbit (1-5 menit) lalu buka `https://admin.homespafamily.my.id`.
3. Sebelum domain aktif, portal tetap bisa dibuka di `https://<domain-vercel>/admin`.

### E4. Redeploy & verifikasi

1. **Deployments → Redeploy** (env baru hanya terbaca saat deploy).
2. Uji cron tanpa mengirim apa pun:
   `https://www.homespafamily.my.id/api/cron/daily?dryRun=1&secret=<CRON_SECRET>`
   → `{"success":true,"data":{... "dryRun":true ...}}`.
3. Buka `/admin` (atau `admin.homespafamily.my.id`) → tab **Pelanggan** (daftar muncul),
   tab **Follow-up** → **Pratinjau** (susun tanpa kirim), tab **Laporan AI** → **Buat laporan**.
4. Di grup WhatsApp admin: kirim `!status` (cek aturan) dan `!laporan` (laporan mingguan).

### E5. Mengaktifkan broadcast harian 10.00 WIB

Secara default hanya follow-up (review/hangat/reminder) yang ON; `broadcast_harian`
dan `reactivation` OFF supaya pemilik yang memutuskan.

1. `/admin` → tab **Pengaturan / Follow-up** (atau tab **Broadcast** → kampanye).
2. Nyalakan aturan **broadcast_harian**, atur `segmen_per_hari` (segmen berbeda tiap hari,
   contoh Senin=pasif, Minggu=baru) dan teks pesan (`{name}` otomatis jadi nama panggilan).
3. Simpan. Cron 10.00 WIB akan menyusun & mengirim ke segmen hari itu (opt-in only,
   maks 1 pesan/pelanggan/hari, di luar jam 08-20 WIB otomatis ditunda).

### E6. Perintah grup WhatsApp admin

| Perintah | Fungsi |
|---|---|
| `!status` | Ringkasan aturan otomasi aktif/nonaktif |
| `!laporan` | Jalankan analisis AI mingguan & kirim ringkasan |
| `SETUJU <id>` / `TOLAK <id>` | Setujui/tolak draft broadcast dari AI |
| `!pause` / `!aktif` | Hentikan/aktifkan seluruh otomasi seketika |
| (dari pelanggan) `STOP` | Matikan otomasi untuk nomor pelanggan itu |

## E. Vercel CLI di laptop (opsional, untuk cek dari terminal)

```cmd
npm install -g vercel
cd "c:\Website salon"
vercel login
vercel link
vercel env ls
vercel --prod
```

## Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| `/api/health` → `storage: json-file` | Env Supabase belum diset di Vercel | Isi Bagian B, lalu Redeploy (env hanya terbaca saat deploy). |
| Chat balas "kendala konfigurasi" | `GEMINI_API_KEY` kosong di Vercel | Isi key, Redeploy. |
| `/admin` → 401 Unauthorized | `ADMIN_KEY` di browser beda dengan di Vercel | Login pakai nilai tabel Bagian B. |
| Push ke GitHub tidak memicu deploy | Repo belum di-import / webhook putus | Vercel → Settings → Git → Connect / periksa autodeploy branch `main`. |
| 404 untuk `/api/...` | File `api/` tidak ikut commit | `git ls-files api` harus ada 6 file; push ulang. |
| Tab Pelanggan/Follow-up error "Could not find the table" | Tabel otomasi belum dibuat di Supabase | Jalankan `supabase.sql` (Bagian D1), cek Table Editor. |
| `admin.homespafamily.my.id` → 404 DEPLOYMENT_NOT_FOUND | Domain belum ditambahkan di Vercel | Vercel → Settings → Domains → Add (Bagian D3). |
| `/api/cron/daily` → 401 Unauthorized | `CRON_SECRET` salah/kosong di Vercel | Samakan secret di Vercel dengan yang dipakai memanggil (Bagian D2). |
| Form booking gagal / `/admin` kosong setelah hardening RLS | Backend masih memakai anon key | Pasang `SUPABASE_SERVICE_ROLE_KEY` di Vercel → Redeploy (Bagian B). RLS menolak anon key. |
| RLS "new row violates row-level security" | Backend belum memakai service_role | Sama seperti di atas — ini perilaku benar, bukan bug. |
| Tidak ada pesan terkirim padahal aturan ON | Di luar jam aman 08-20 WIB, atau pelanggan belum opt-in / sudah kirim pesan hari ini | Cek tab Follow-up → riwayat antrean (status `queued`/`skipped`) & ringkasan cron. |

## Support

- Vercel Docs: https://vercel.com/docs
- WhatsApp Admin: 0851-2624-6175

