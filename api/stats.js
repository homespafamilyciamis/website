// GET /api/stats — butuh ADMIN_KEY jika dikonfigurasi
const store = require('../bookingStore');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  const configured = (process.env.ADMIN_KEY || '').trim();
  if (configured) {
    const given = String(req.headers['x-admin-key'] || req.query.adminKey || '');
    if (given !== configured) {
      return res.status(401).json({ success: false, message: 'Unauthorized: ADMIN_KEY salah.' });
    }
  }
  try {
    const data = await store.getStats();
    return res.status(200).json({ success: true, data, ...store.getStorageInfo() });
  } catch (err) {
    console.error('GET /api/stats error:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil statistik' });
  }
};
