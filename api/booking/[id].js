// GET + DELETE /api/booking/[id]
// GET: detail booking. DELETE: batalkan booking.
const store = require('../../../bookingStore');

module.exports = async function handler(req, res) {
  const configured = (process.env.ADMIN_KEY || '').trim();
  if (configured) {
    const given = String(req.headers['x-admin-key'] || req.query.adminKey || '');
    if (given !== configured) {
      return res.status(401).json({ success: false, message: 'Unauthorized: ADMIN_KEY salah.' });
    }
  }
  try {
    const { id } = req.query;

    if (req.method === 'GET') {
      const booking = await store.getBookingById(id);
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking tidak ditemukan' });
      }
      return res.status(200).json({ success: true, data: booking });
    }

    if (req.method === 'DELETE') {
      const removed = await store.deleteBooking(id);
      if (!removed) {
        return res.status(404).json({ success: false, message: 'Booking tidak ditemukan' });
      }
      return res.status(200).json({ success: true, message: 'Booking berhasil dibatalkan', booking: removed });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('GET/DELETE /api/booking/[id] error:', err);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
};

