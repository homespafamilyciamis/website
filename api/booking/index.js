// ============================================================
// Vercel Serverless: POST /api/booking
// Simpan booking ke Supabase (via bookingStore.js)
// ============================================================
const store = require('../../bookingStore');

const ALLOWED_STATUS = ['Menunggu Konfirmasi', 'Terkonfirmasi', 'Selesai', 'Dibatalkan'];

function isPastDate(tanggal) {
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { service, price, tanggal, jam, nama, whatsapp, alamat, catatan } = body;

    if (!service || price === undefined || !tanggal || !jam || !nama || !whatsapp || !alamat) {
      return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });
    }
    const digits = String(whatsapp).replace(/\D/g, '');
    if (!/^(\+?62|0)\d{9,13}$/.test('+' + digits.replace(/^\+/, '')) && !/^(62|0)\d{9,12}$/.test(digits)) {
      if (!/^(62|0)\d{9,12}$/.test(digits)) {
        return res.status(400).json({ success: false, message: 'Nomor WhatsApp tidak valid' });
      }
    }
    if (isPastDate(tanggal)) {
      return res.status(400).json({ success: false, message: 'Tanggal booking tidak boleh sebelum hari ini.' });
    }
    if (isOutsideHours(jam)) {
      return res.status(400).json({ success: false, message: 'Jam layanan 08.00–21.00 WIB.' });
    }

    // Cegah double-booking tanggal+jam yang masih aktif
    const existing = await store.getAllBookings();
    const clash = existing.find((b) =>
      b.tanggal === tanggal && String(b.jam).slice(0, 5) === String(jam).slice(0, 5) &&
      ['Menunggu Konfirmasi', 'Terkonfirmasi'].includes(b.status)
    );
    if (clash) {
      return res.status(409).json({ success: false, message: 'Jadwal tersebut sudah dibooking. Silakan pilih jam lain.' });
    }

    const booking = {
      id: store.generateBookingId(),
      service: String(service).slice(0, 200),
      price: Number(price) || 0,
      tanggal, jam: String(jam).slice(0, 5),
      nama: String(nama).slice(0, 100),
      whatsapp: String(whatsapp).slice(0, 20),
      alamat: String(alamat).slice(0, 500),
      catatan: String(catatan || '').slice(0, 500),
      status: 'Menunggu Konfirmasi',
      createdAt: new Date().toISOString()
    };

    const saved = await store.createBooking(booking);

    // Notifikasi otomatis ke grup WA admin (gagal WA tidak menggagalkan booking)
    try {
      const waGroup = require('../../waGroup');
      const notif = await waGroup.notifyGroupNewBooking(saved);
      console.log('[booking] notifikasi grup WA:', notif.ok ? 'OK' : ('GAGAL ' + notif.reason));
    } catch (e) {
      console.error('[booking] notifikasi grup WA error:', e && e.message);
    }

    return res.status(201).json({ success: true, message: 'Booking berhasil disimpan', booking: saved });
  } catch (err) {
    console.error('POST /api/booking error:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
};
