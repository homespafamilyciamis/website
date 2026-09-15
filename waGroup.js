// ============================================================
// HOME SPA FAMILY — Modul Grup WA & Closing Booking (via Fonnte)
//
// Dipakai oleh:
//   - api/booking/index.js  : notifikasi booking baru ke grup admin
//   - api/wa-webhook.js     : deteksi pesan booking dari form website,
//                             template closing + pembayaran ke pelanggan,
//                             teruskan foto bukti transfer ke grup admin.
//
// Env (semua opsional — ada nilai bawaan yang aman):
//   FONNTE_TOKEN, WA_GROUP_ID,
//   BCA_NUMBER / BCA_HOLDER, DANA_NUMBER / DANA_HOLDER, DP_MINIMAL
// ============================================================

const FONNTE_SEND_URL = 'https://api.fonnte.com/send';

// Header pesan booking dari form website (public/index.html)
const BOOKING_HEADER = 'BOOKING LAYANAN HOME SPA FAMILY';

function paymentConfig() {
  return {
    dpMinimal: Number(process.env.DP_MINIMAL || 50000) || 50000,
    bca: {
      number: (process.env.BCA_NUMBER || '203-123-5415').trim(),
      holder: (process.env.BCA_HOLDER || 'Lilis Riawaningsih').trim()
    },
    dana: {
      number: (process.env.DANA_NUMBER || '0831-9558-5892').trim(),
      holder: (process.env.DANA_HOLDER || 'Septian Gilang').trim()
    }
  };
}

function groupId() {
  return (process.env.WA_GROUP_ID || '').trim();
}

function rupiah(n) {
  try {
    return 'Rp' + Number(n || 0).toLocaleString('id-ID');
  } catch (_) {
    return 'Rp' + String(n || 0);
  }
}

function to62(num) {
  let s = String(num || '').replace(/\D/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (!s.startsWith('62')) s = '62' + s;
  return s;
}

function maskNumber(num) {
  const s = String(num || '');
  return s.length > 4 ? '****' + s.slice(-4) : '****';
}

/**
 * Kategori layanan dari teks nama layanan.
 * true = home service | false = salon/studio | null = tidak jelas
 */
function isHomeService(layanan) {
  const s = String(layanan || '').toLowerCase();
  if (/panggil|home\s*service|ke\s*rumah|terapis\s*datang/.test(s)) return true;
  if (/salon|studio/.test(s)) return false;
  return null;
}

/**
 * Deteksi & parse pesan booking yang dikirim form website ke WA.
 * @returns {object|null} null jika bukan pesan booking
 */
function parseBookingMessage(message) {
  const text = String(message || '');
  if (!text.includes(BOOKING_HEADER)) return null;

  const field = (label) => {
    const re = new RegExp('\\*\\s*' + label + '\\s*:\\*\\s*([^\\n]+)', 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };

  const nama = field('Nama');
  const whatsapp = field('No\\. WhatsApp');
  const layanan = field('Layanan');
  const jadwal = field('Jadwal');
  const jam = field('Jam Booking');
  const alamat = field('Alamat');
  const catatan = field('Catatan');

  if (!nama && !layanan) return null;

  return { nama, whatsapp, layanan, jadwal, jam, alamat, catatan };
}

/**
 * Template balasan closing ke pelanggan (deterministik, tanpa AI,
 * agar nomor rekening & kebijakan DP tidak pernah salah).
 */
function buildBookingCustomerReply(b) {
  const pay = paymentConfig();
  const dp = rupiah(pay.dpMinimal);
  const cat = isHomeService(b.layanan);

  let kebijakan;
  if (cat === true) {
    kebijakan =
      'Untuk layanan panggilan (home service), pembayaran dilakukan di awal:\n' +
      '- Bayar penuh saat booking, ATAU\n' +
      '- DP minimal ' + dp + ' untuk mengunci jadwal (sisanya ke terapis saat tiba).';
  } else if (cat === false) {
    kebijakan =
      'Untuk layanan di salon/studio, Kakak bebas memilih:\n' +
      '- Bayar di tempat setelah treatment, ATAU\n' +
      '- DP (bebas nominal) jika ingin jadwal lebih aman terkunci.';
  } else {
    kebijakan =
      '- Layanan panggilan (home service): bayar penuh saat booking atau DP minimal ' + dp + '.\n' +
      '- Layanan di salon/studio: boleh bayar di tempat, atau DP untuk mengunci jadwal.';
  }

  return (
    'Terima kasih' + (b.nama ? ' ' + b.nama : '') + '! 🙏 Booking Kakak sudah kami terima.\n\n' +
    '📋 *Konfirmasi Detail Booking*\n' +
    '• Layanan: ' + (b.layanan || '-') + '\n' +
    '• Jadwal: ' + (b.jadwal || '-') + '\n' +
    '• Jam: ' + (b.jam || '-') + ' WIB\n' +
    '• Alamat: ' + (b.alamat || '-') + '\n' +
    (b.catatan ? '• Catatan: ' + b.catatan + '\n' : '') +
    '\n💰 *Pembayaran*\n' + kebijakan + '\n\n' +
    'Pembayaran dapat dikirim ke:\n' +
    '🏦 BCA ' + pay.bca.number + ' a.n. ' + pay.bca.holder + '\n' +
    '📱 DANA ' + pay.dana.number + ' a.n. ' + pay.dana.holder + '\n\n' +
    'Setelah transfer, kirim buktinya ke chat ini ya Kak 📸\n' +
    'Admin kami verifikasi, jadwal Kakak langsung dikunci. 🙏'
  );
}

/** Teks notifikasi booking baru untuk grup admin. */
function buildGroupBookingText(b) {
  const pay = paymentConfig();
  return (
    '🔔 *BOOKING BARU MASUK* 🔔\n' +
    '──────────────────\n' +
    '👤 Nama: ' + (b.nama || '-') + '\n' +
    '📱 WA: wa.me/' + to62(b.whatsapp) + '\n' +
    '💆 Layanan: ' + (b.service || b.layanan || '-') + '\n' +
    '💵 Harga: ' + rupiah(b.price) + '\n' +
    '📅 Jadwal: ' + (b.tanggal || '-') + '\n' +
    '⏰ Jam: ' + (b.jam || '-') + ' WIB\n' +
    '📍 Alamat: ' + (b.alamat || '-') + '\n' +
    '📝 Catatan: ' + (b.catatan || '-') + '\n' +
    '📊 Status: ' + (b.status || 'Menunggu Konfirmasi') + '\n' +
    '──────────────────\n' +
    '✅ Tersimpan otomatis di sistem. Tunggu bukti transfer dari pelanggan\n' +
    '(DP min ' + rupiah(pay.dpMinimal) + ' untuk layanan panggilan).'
  );
}

/** Kirim pesan teks ke grup admin (WA_GROUP_ID). */
async function sendToGroup(text) {
  const token = (process.env.FONNTE_TOKEN || '').trim();
  const target = groupId();
  if (!token) return { ok: false, reason: 'FONNTE_TOKEN kosong' };
  if (!target) return { ok: false, reason: 'WA_GROUP_ID kosong' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const form = new URLSearchParams();
    form.set('target', target);
    form.set('message', text);
    const resp = await fetch(FONNTE_SEND_URL, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal
    });
    const data = await resp.json().catch(() => ({}));
    const ok = resp.ok && data.status === true;
    return { ok, reason: ok ? '' : (data.reason || 'HTTP ' + resp.status) };
  } catch (err) {
    return {
      ok: false,
      reason: err && err.name === 'AbortError' ? 'timeout' : ((err && err.message) || 'network error')
    };
  } finally {
    clearTimeout(timer);
  }
}

async function notifyGroupNewBooking(booking) {
  if (!groupId()) return { ok: false, reason: 'WA_GROUP_ID kosong' };
  return sendToGroup(buildGroupBookingText(booking || {}));
}

/**
 * Teruskan media (foto bukti transfer) dari pelanggan ke grup admin.
 * Fonnte: kirim file via parameter `url` (link langsung ke file).
 */
async function forwardMedia({ sender, name, caption, url }) {
  const token = (process.env.FONNTE_TOKEN || '').trim();
  const target = groupId();
  if (!token) return { ok: false, reason: 'FONNTE_TOKEN kosong' };
  if (!target) return { ok: false, reason: 'WA_GROUP_ID kosong' };
  if (!url) return { ok: false, reason: 'url media kosong' };

  const text =
    '📸 *Bukti transfer masuk*\n' +
    'Dari: ' + (name || 'Pelanggan') + ' (wa.me/' + to62(sender) + ')\n' +
    (caption ? 'Pesan: ' + caption + '\n' : '') +
    '──────────────────\nMohon dicek & konfirmasi ke pelanggan.';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const form = new URLSearchParams();
    form.set('target', target);
    form.set('message', text);
    form.set('url', url);
    const resp = await fetch(FONNTE_SEND_URL, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal
    });
    const data = await resp.json().catch(() => ({}));
    const ok = resp.ok && data.status === true;
    return { ok, reason: ok ? '' : (data.reason || 'HTTP ' + resp.status) };
  } catch (err) {
    return {
      ok: false,
      reason: err && err.name === 'AbortError' ? 'timeout' : ((err && err.message) || 'network error')
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  BOOKING_HEADER,
  parseBookingMessage,
  buildBookingCustomerReply,
  buildGroupBookingText,
  notifyGroupNewBooking,
  forwardMedia,
  sendToGroup,
  isHomeService,
  paymentConfig,
  maskNumber
};
