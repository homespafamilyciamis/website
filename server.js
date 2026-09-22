const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const store = require('./bookingStore');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Kunci admin sederhana: jika ADMIN_KEY diisi, endpoint admin wajib kirim header x-admin-key.
function requireAdmin(req, res, next) {
  const configured = (process.env.ADMIN_KEY || '').trim();
  if (!configured) return next();
  const given = String(req.headers['x-admin-key'] || req.query.adminKey || req.body?.adminKey || '');
  if (given !== configured) {
    return res.status(401).json({ success: false, message: 'Unauthorized: ADMIN_KEY salah.' });
  }
  return next();
}

// Validasi bisnis: tanggal WIB tidak boleh lampau, jam 08.00–21.00.
function isPastDateWIB(tanggal) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  return String(tanggal) < today;
}

function isOutsideHours(jam) {
  const m = String(jam || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return true;
  const mins = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return mins < 8 * 60 || mins > 21 * 60;
}

function formatDate(dateString) {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('id-ID', options);
}

// Routes

// GET - Halaman utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET - Halaman admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// GET - Info status server + storage (tersedia lokal & Vercel)
const healthHandler = (req, res) => {
  res.json({ success: true, time: new Date().toISOString(), ...store.getStorageInfo() });
};
app.get('/api/health', healthHandler);

// POST - Chat Eva lokal (proxy ke Gemini, logika sama dengan api/chat.js di Vercel)
app.post('/api/chat', async (req, res) => {
  let message = req.body?.message;
  if (!message && typeof req.body === 'string') {
    try { message = JSON.parse(req.body).message; } catch (_) {}
  }
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Pesan tidak boleh kosong' });
  }
  const cleanMessage = message.trim().slice(0, 4000);
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(200).json({
      reply: 'Maaf Kak, layanan Eva sedang mengalami kendala konfigurasi. ' +
        'Silakan coba lagi beberapa saat atau hubungi admin Home Spa Family.'
    });
  }
  // Prompt Eva: duplikat dari api/chat.js agar perilaku lokal = produksi.
  // Diambil dari file api/chat.js saat runtime tidak memungkinkan (ESM),
  // jadi gunakan prompt ringkas yang konsisten dengan pricelist resmi.
  const systemPrompt = [
    'Kamu adalah "Eva", Customer Service virtual resmi Home Spa Family.',
    'Ramah, santun, hangat, profesional. Panggil pelanggan dengan "Kak". Jawaban singkat.',
    'Layanan: salon/studio di Jalan Otista, Perum Bumi Ciharalang Lestari, Ciharalang, Cijeungjing - Ciamis;',
    'dan home service wilayah Ciamis. Jam 08.00-21.00 WIB setiap hari.',
    'Harga salon: Body massage 120rb, Pijat ibu hamil 200rb/jam, Facial 100rb, Face massage+masker 100rb,',
    'Facial+masker 150rb, Creambath 100rb, Masker rambut 85rb, Scrub 100rb, Kerokan 30rb, Cuci catok 30rb,',
    'Gurah mata 150rb, Bekam 300rb. Paket: Manja 230rb/1,5jam, Rilex 210rb/1,5jam, Komplit 350rb/2,5jam.',
    'Home service: Body Massage 175rb/70mnt, Paket Rilex 275rb/90mnt, Paket Komplit 375rb/150mnt.',
    'Untuk booking arahkan ke formulir BOOKING ONLINE di website. WA admin 0851-2624-6175 hanya jika diminta.',
    'Pembayaran: layanan panggilan = bayar penuh saat booking atau DP min Rp50.000; layanan di salon = boleh bayar di tempat / DP kunci jadwal.',
    'Rekening: BCA 203-123-5415 a.n. Lilis Riawaningsih, DANA 0831-9558-5892 a.n. Septian Gilang. Bukti transfer via WhatsApp, admin verifikasi.',
    'Jika pelanggan sudah mengisi form booking: katakan booking diterima sistem, konfirmasi + pembayaran otomatis dikirim ke WhatsApp-nya. Jangan minta isi form lagi.'
  ].join('\n');
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
  let lastError = '';
  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: cleanMessage }] }],
          generationConfig: { maxOutputTokens: 700 }
        }),
        signal: controller.signal
      });
      const data = await response.json();
      if (response.ok) {
        const reply = (data.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || '').join('').trim();
        if (reply) return res.status(200).json({ reply });
      }
      lastError = data.error?.message || ('Gemini API error (' + response.status + ')');
    } catch (err) {
      lastError = err?.name === 'AbortError' ? 'Timeout ke layanan AI.' : (err?.message || 'Koneksi AI gagal.');
    } finally {
      clearTimeout(timeout);
    }
  }
  console.error('Eva AI error (lokal):', lastError);
  return res.status(200).json({
    reply: 'Maaf Kak, Eva sedang mengalami kendala untuk menjawab saat ini. ' +
      'Silakan coba kirim pertanyaan lagi beberapa saat lagi.'
  });
});

// POST - Submit booking
app.post('/api/booking', async (req, res) => {
    try {
        const { service, price, tanggal, jam, nama, whatsapp, alamat, catatan } = req.body;

        // Validasi input
        if (!service || price === undefined || !tanggal || !jam || !nama || !whatsapp || !alamat) {
            return res.status(400).json({
                success: false,
                message: 'Semua field wajib diisi'
            });
        }

        // Validasi nomor WhatsApp
        const digits = String(whatsapp).replace(/\D/g, '');
        if (!/^(62|0)\d{9,12}$/.test(digits)) {
            return res.status(400).json({
                success: false,
                message: 'Nomor WhatsApp tidak valid'
            });
        }

        // Validasi tanggal & jam operasional
        if (isPastDateWIB(tanggal)) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal booking tidak boleh sebelum hari ini.'
            });
        }
        if (isOutsideHours(jam)) {
            return res.status(400).json({
                success: false,
                message: 'Jam layanan 08.00–21.00 WIB.'
            });
        }

        // Cegah double-booking tanggal+jam yang masih aktif
        const existing = await store.getAllBookings();
        const clash = existing.find((b) =>
            b.tanggal === tanggal && String(b.jam).slice(0, 5) === String(jam).slice(0, 5) &&
            ['Menunggu Konfirmasi', 'Terkonfirmasi'].includes(b.status)
        );
        if (clash) {
            return res.status(409).json({
                success: false,
                message: 'Jadwal tersebut sudah dibooking. Silakan pilih jam lain.'
            });
        }

        // Create new booking
        const newBooking = {
            id: store.generateBookingId(),
            service: String(service).slice(0, 200),
            price: Number(price) || 0,
            tanggal,
            jam: String(jam).slice(0, 5),
            nama: String(nama).slice(0, 100),
            whatsapp: String(whatsapp).slice(0, 20),
            alamat: String(alamat).slice(0, 500),
            catatan: String(catatan || '').slice(0, 500),
            status: 'Menunggu Konfirmasi',
            createdAt: new Date().toISOString()
        };

        const saved = await store.createBooking(newBooking);

        // Send success response
        res.json({
            success: true,
            message: 'Booking berhasil disimpan',
            booking: saved
        });

        // Log booking
        console.log(`[${new Date().toLocaleString('id-ID')}] Booking baru: ${saved.id} - ${saved.nama}`);
    } catch (error) {
        console.error('Error in booking:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server',
            error: error.message
        });
    }
});

// GET - Semua bookings (admin)
app.get('/api/bookings', requireAdmin, async (req, res) => {
    try {
        const bookings = await store.getAllBookings();
        res.json({
            success: true,
            data: bookings,
            total: bookings.length,
            ...store.getStorageInfo()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data bookings'
        });
    }
});

// GET - Booking detail by ID (admin)
app.get('/api/booking/:id', requireAdmin, async (req, res) => {
    try {
        const booking = await store.getBookingById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking tidak ditemukan'
            });
        }

        res.json({
            success: true,
            data: booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data booking'
        });
    }
});

// PUT - Update booking status (admin)
app.put('/api/booking/:id/status', requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['Menunggu Konfirmasi', 'Terkonfirmasi', 'Selesai', 'Dibatalkan'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status tidak valid'
            });
        }

        const updated = await store.updateBookingStatus(req.params.id, status);

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: 'Booking tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: 'Status booking berhasil diperbarui',
            booking: updated
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server'
        });
    }
});

// DELETE - Cancel booking (admin)
app.delete('/api/booking/:id', requireAdmin, async (req, res) => {
    try {
        const removed = await store.deleteBooking(req.params.id);

        if (!removed) {
            return res.status(404).json({
                success: false,
                message: 'Booking tidak ditemukan'
            });
        }

        res.json({
            success: true,
            message: 'Booking berhasil dibatalkan',
            booking: removed
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan pada server'
        });
    }
});

// GET - Booking statistics (admin)
app.get('/api/stats', requireAdmin, async (req, res) => {
    try {
        const stats = await store.getStats();

        res.json({
            success: true,
            data: stats,
            ...store.getStorageInfo()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil statistik'
        });
    }
});

// ---- Otomasi Eva: endpoint admin & cron (logika sama dengan versi Vercel) ----
// Dipasang sebagai handler Express agar bisa diuji lokal lewat `npm start`.
// Di Vercel, keduanya adalah 1 fungsi catch-all (hemat batas paket Hobby).
[
  ['/api/otomasi/:aksi', './api/otomasi/[...aksi]'],
  ['/api/cron/:job', './api/cron/[...job]']
].forEach(function (pasangan) {
  app.all(pasangan[0], function (req, res, next) {
    Promise.resolve(require(pasangan[1])(req, res)).catch(next);
  });
});

// Error handling
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: 'Endpoint tidak ditemukan'
    });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server Home Spa Family berjalan di http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('Storage:', store.getStorageInfo());
  });
}

module.exports = app;
module.exports.healthHandler = healthHandler;
