// ============================================================
// LOGIKA ENDPOINT /api/otomasi/automation   (butuh ADMIN_KEY)
// Dipanggil oleh fungsi catch-all: api/otomasi/[...aksi].js
//
// GET                                    -> daftar aturan otomasi
// POST { key, is_on, config }            -> nyalakan/matikan atau ubah setelan
// ============================================================
const automationStore = require('../automationStore');
const { cekAdmin, bodyJson } = require('../apiGuard');

module.exports = async function handler(req, res) {
  if (!cekAdmin(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized: ADMIN_KEY salah.' });
  }

  try {
    if (req.method === 'GET') {
      const data = await automationStore.getRules();
      return res.status(200).json({ success: true, data, ...automationStore.getStorageInfo() });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const body = bodyJson(req);
    const key = String(body.key || '').trim();
    if (!key) {
      return res.status(400).json({ success: false, message: 'Field "key" wajib diisi.' });
    }

    const rule = await automationStore.getRule(key);
    if (!rule) {
      return res.status(404).json({ success: false, message: 'Aturan "' + key + '" tidak ditemukan.' });
    }

    const patch = {};
    if (body.is_on !== undefined) {
      patch.is_on = body.is_on === true || body.is_on === 'true' || body.is_on === 1 || body.is_on === '1';
    }
    if (body.config && typeof body.config === 'object') {
      // Digabung dengan setelan lama, jadi admin tidak perlu mengirim semua field.
      patch.config = Object.assign({}, rule.config || {}, body.config);
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, message: 'Tidak ada perubahan yang dikirim.' });
    }

    const data = await automationStore.updateRule(key, patch);
    return res.status(200).json({ success: true, message: 'Aturan otomasi diperbarui.', data });
  } catch (err) {
    console.error('/api/automation error:', err);
    return res.status(500).json({
      success: false,
      message: (err && err.message) || 'Terjadi kesalahan pada server'
    });
  }
};