# Vercel Deployment — Home Spa Family Website

Repo: `https://github.com/homespafamilyciamis/website` (branch `main`)
Output: folder `public/` (lihat `vercel.json`)
API: `api/*.js` serverless (chat Eva + booking Supabase)
DB: Supabase project `kyxqufvwvofdaohqlknf`, tabel `public.bookings` (lihat `supabase.sql`)

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
| `SUPABASE_URL` | `https://kyxqufvwvofdaohqlknf.supabase.co` | Dipakai `bookingStore.js`. |
| `SUPABASE_ANON_KEY` | `sb_publishable_rtYWrrHVTHa01NoLU1OV2A_Alazj31d` | Atau `SUPABASE_SERVICE_ROLE_KEY` bila ada (lebih aman untuk backend). |
| `ADMIN_KEY` | `e50f53aa53d13d69ad6dff1ac0b7a0b8522653a17d371050` | Kunci login `/admin`. Samakan dengan `.env` lokal. |
| `WHATSAPP_NUMBER` | `6285126246175` | Nomor admin untuk link WA. |
| `NODE_ENV` | `production` | Standar. |

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

## D. Vercel CLI di laptop (opsional, untuk cek dari terminal)

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

## Support

- Vercel Docs: https://vercel.com/docs
- WhatsApp Admin: 0851-2624-6175

