# Home Spa Family Website

Website booking dan layanan Home Spa Family dengan fitur lengkap untuk reservasi online.

## Fitur Utama

✨ **Frontend:**
- Homepage dengan daftar lengkap layanan dan paket spa
- Form booking online yang responsif
- Integrasi WhatsApp untuk konfirmasi
- Mobile-friendly design
- Navigasi yang mudah digunakan

💼 **Backend:**
- REST API untuk manajemen booking
- Penyimpanan data booking ke file JSON
- Sistem status tracking booking
- Statistik penjualan dan booking
- Validasi data input

## Teknologi

- **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
- **Backend:** Node.js, Express.js
- **Database:** JSON File Storage
- **Integration:** WhatsApp API

## Instalasi

### Prerequisites
- Node.js v14 atau lebih tinggi
- npm atau yarn

### Step 1: Clone Repository
```bash
git clone https://github.com/homespafamilyciamis/website.git
cd website
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Setup Environment Variables
```bash
cp .env.example .env
# Edit .env dan sesuaikan konfigurasi
```

### Step 4: Buat Folder Public
```bash
mkdir public
cp index.html public/
cp -r styles public/
cp -r js public/
cp -r assets public/
```

### Step 5: Jalankan Server
```bash
# Development
npm run dev

# Production
npm start
```

Server akan berjalan di `http://localhost:5000`

## Struktur Folder

```
website/
├── public/
│   ├── index.html
│   ├── styles/
│   │   └── style.css
│   ├── js/
│   │   └── script.js
│   └── assets/
│       ├── logo.png
│       ├── hero-family.jpg
│       └── ...
├── server.js
├── package.json
├── .env
├── .gitignore
└── bookings.json
```

## API Endpoints

### Booking Management

#### POST /api/booking
Membuat booking baru
```json
{
  "service": "Body massage",
  "price": 120000,
  "tanggal": "2024-09-15",
  "jam": "14:00",
  "nama": "John Doe",
  "whatsapp": "0831-9558-5892",
  "alamat": "Jl. Merdeka No. 123, Jakarta",
  "catatan": "Alergi terhadap minyak tertentu"
}
```

#### GET /api/bookings
Mendapatkan semua booking

#### GET /api/booking/:id
Mendapatkan detail booking berdasarkan ID

#### PUT /api/booking/:id/status
Mengupdate status booking
```json
{
  "status": "Terkonfirmasi"
}
```

#### DELETE /api/booking/:id
Membatalkan/menghapus booking

#### GET /api/stats
Mendapatkan statistik booking dan revenue

## Layanan yang Tersedia

| Layanan | Harga |
|---------|-------|
| Body massage | Rp 120.000 / 60 menit |
| Pijat ibu hamil | Rp 200.000 / 60 menit |
| Facial | Rp 100.000 / 60 menit |
| Face massage + masker | Rp 100.000 / 45 menit |
| Facial + masker | Rp 150.000 / 60 menit |
| Creambath | Rp 100.000 / 45 menit |
| Masker rambut | Rp 85.000 / 30 menit |
| Scrub | Rp 100.000 / 45 menit |
| Kerokan | Rp 30.000 / 30 menit |
| Cuci catok | Rp 30.000 / 30 menit |
| Gurah mata | Rp 150.000 / 45 menit |
| Bekam | Rp 300.000 / 60 menit |
| Paket Manja | Rp 230.000 / 90 menit |
| Paket Rileks | Rp 210.000 / 90 menit |
| Paket Komplit | Rp 350.000 / 150 menit |

## Konfigurasi Pembayaran

Website ini mendukung pembayaran via transfer rekening. Untuk setup:

1. Update informasi rekening di file `.env`
2. Informasi rekening akan otomatis dikirim ke customer setelah booking

## Contoh Flow Booking

1. Customer memilih layanan dan paket di halaman utama
2. Klik "Pesan Sekarang" atau tombol booking di paket
3. Isi form booking (layanan, tanggal, jam, nama, WhatsApp, alamat)
4. Klik "Konfirmasi Pemesanan"
5. Sistem akan mengirim data ke backend
6. Customer akan diarahkan ke WhatsApp untuk konfirmasi
7. Admin akan merespon dan mengirim detail pembayaran

## Fitur Admin (Opsional)

Untuk menambahkan dashboard admin, bisa membuat:
- Halaman login admin
- Dashboard untuk melihat semua booking
- Form untuk update status booking
- Export laporan booking

## Security Notes

⚠️ **Penting untuk production:**
- Gunakan database yang lebih robust (MongoDB, PostgreSQL)
- Implement authentication untuk admin
- Gunakan HTTPS
- Validasi input lebih ketat
- Implement rate limiting
- Gunakan JWT untuk API security

## Support & Contact

- **WhatsApp:** 0831-9558-5892
- **Email:** help@homespafamily.com

## License

ISC

---

**Dibuat dengan ❤️ untuk kenyamanan keluarga Indonesia**
