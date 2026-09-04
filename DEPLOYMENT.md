# Vercel Deployment Guide - Home Spa Family Website

## Quick Start dengan Vercel

Vercel adalah platform terbaik untuk deploy aplikasi Node.js + Frontend dengan cepat dan gratis!

### Step 1: Persiapan di GitHub

Website sudah siap di: `https://github.com/homespafamilyciamis/website`

### Step 2: Deploy ke Vercel

#### Metode 1: Connect GitHub (Recommended)

1. Buka https://vercel.com
2. Klik **"Sign Up"** dan login dengan GitHub
3. Klik **"New Project"**
4. Pilih repository **"website"** dari homespafamilyciamis
5. Klik **"Import"**
6. Di halaman konfigurasi:
   - Framework: **Pilih "Other" atau skip**
   - Build Command: `npm install`
   - Install Command: `npm run build` (jika tidak ada, kosongkan)
   - Output Directory: `public`
   - Environment Variables: Tambahkan dari `.env`
7. Klik **"Deploy"**

#### Metode 2: Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Di folder website
cd website

# Deploy
vercel
```

### Step 3: Setup Environment Variables di Vercel

1. Buka project Vercel
2. Masuk ke **Settings** → **Environment Variables**
3. Tambahkan variable:
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
   - `WHATSAPP_NUMBER` = `6283195585892`

### Step 4: Konfigurasi Custom Domain (Opsional)

1. Di Vercel, masuk ke **Settings** → **Domains**
2. Tambahkan domain Anda
3. Follow petunjuk untuk update DNS

## Troubleshooting

### Website error 404
- Pastikan file ada di folder `public/`
- Check `vercel.json` configuration
- Rebuild: Klik "Redeploy" di Vercel dashboard

### API tidak bekerja
- Check server logs di Vercel
- Pastikan PORT di set ke 3000
- Verifikasi database connection

### File tidak ter-upload
- Periksa `.gitignore`
- Pastikan file tidak diabaikan
- Push ulang ke GitHub

## URL Website Setelah Deploy

Website akan tersedia di: `https://your-project.vercel.app`

Contoh: `https://home-spa-family.vercel.app`

## Monitoring & Logs

1. Buka Vercel Dashboard
2. Pilih project
3. Tab **"Deployments"** - lihat history
4. Tab **"Functions"** - lihat API logs
5. Tab **"Analytics"** - lihat traffic

## Automatic Deployment

Setiap kali push ke GitHub branch `main`, Vercel akan otomatis:
1. Build ulang
2. Deploy ke production
3. Update live website

## Manual Redeploy

1. Buka project di Vercel
2. Tab **"Deployments"**
3. Klik 3 dots pada deployment terbaru
4. Pilih **"Redeploy"**

## Tips Penting

✅ **Do:**
- Gunakan `.env` untuk secret variables
- Test locally sebelum push ke GitHub
- Check Vercel logs saat error
- Backup database regularly

❌ **Don't:**
- Jangan commit `.env` ke GitHub
- Jangan push `node_modules`
- Jangan hardcode credentials
- Jangan gunakan large files (>50MB)

## Upgrade ke Plan Berbayar (Opsional)

**Fitur Gratis Sudah Cukup Untuk:**
- Traffic unlimited
- 1 Production deployment
- 50 Serverless Functions
- Custom domains

**Upgrade jika butuh:**
- Priority support
- Team collaboration
- Advanced security
- Custom runtimes

## Production Checklist

Sebelum go live, pastikan:
- [ ] Website responsive di mobile
- [ ] Booking form berfungsi
- [ ] WhatsApp integration works
- [ ] Database backup setup
- [ ] Domain custom configured
- [ ] Email notifications ready
- [ ] Analytics tracking active
- [ ] Security headers set
- [ ] HTTPS enabled (automatic)
- [ ] 404 error page setup

## Support

**Vercel Docs:** https://vercel.com/docs
**GitHub Issues:** Report bug di repository
**WhatsApp Support:** 0831-9558-5892

---

**Website siap di:** https://vercel.com 🚀
