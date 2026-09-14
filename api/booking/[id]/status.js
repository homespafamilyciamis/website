// ============================================================
// Vercel Serverless: PUT /api/booking/[id]/status
// ============================================================
const store = require('../../../../bookingStore');

const ALLOWED_STATUS = ['Menunggu Konfirmasi', 'Terkonfirmasi', 'Selesai', 'Dibatalkan'];

module.exports = async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  const configured = (process.env.ADMIN_KEY || '').trim();
  if (configured) {
    const bodyKey = typeof req.body === 'string' ? '' : (req.body?.adminKey || '');
    const given = String(req.headers['x-admin-key'] || req.query.adminKey || bodyKey || '');
    if (given !== configured) {
      return res.status(401).json({ success: false, message: 'Unauthorized: ADMIN_KEY salah.' });
    }
  }
  try {
    const { id } = req.query;
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { status } = body;
    if (!ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }
    const updated = await store.updateBookingStatus(id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Booking tidak ditemukan' });
    }
    return res.status(200).json({ success: true, message: 'Status booking berhasil diperbarui', booking: updated });
  } catch (err) {
    console.error('PUT /api/booking/[id]/status error:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
};

