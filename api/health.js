// GET /api/health — cek status server + storage (Supabase vs json-file)
const store = require('../bookingStore');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  return res.status(200).json({
    success: true,
    time: new Date().toISOString(),
    ...store.getStorageInfo()
  });
};
