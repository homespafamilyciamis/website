// GET /api/bookings — butuh ADMIN_KEY jika dikonfigurasi
const store = require('../../bookingStore');

function checkAdmin(req) {
  const configured = (process.env.ADMIN_KEY || '').trim();
  if (!configured) return true;
  const given = String(req.headers['x-admin-key'] || req.query.adminKey || '');
  return given === configured;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  if (!checkAdmin(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized: ADMIN_KEY salah.' });
  }
  try {
    const bookings = await store.getAllBookings();
    const info = store.getStorageInfo();
    return res.status(200).json({ success: true, data: bookings, ...info });
  } catch (err) {
    console.error('GET /api/bookings error:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data booking' });
  }
};
