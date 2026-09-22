// ============================================================
// LOGIKA ENDPOINT /api/otomasi/customers   (butuh ADMIN_KEY)
// Dipanggil oleh fungsi catch-all: api/otomasi/[...aksi].js
//
// GET  ?segmen=pasif&q=cari&limit=200   -> daftar pelanggan + ringkasan
// GET  ?outbox=1&status=failed          -> riwayat antrean pesan otomatis
// POST { aksi: 'optin' | 'optout' }     -> ubah izin dihubungi
// POST { aksi: 'pratinjau-followup' }   -> susun follow-up TANPA mengirim
// POST { aksi: 'jalankan-followup' }    -> susun + kirim yang jatuh tempo
// POST { aksi: 'kirim-antrean', limit }  -> kirim antrean yang menunggu
// ============================================================
const customerStore = require('../customerStore');
const waFollowup = require('../waFollowup');
const { cekAdmin, bodyJson } = require('../apiGuard');

module.exports = async function handler(req, res) {
  if (!cekAdmin(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized: ADMIN_KEY salah.' });
  }

  try {
    if (req.method === 'GET') {
      const q = req.query || {};

      if (String(q.outbox || '') === '1') {
        const [data, ringkasan] = await Promise.all([
          customerStore.listOutbox({ status: q.status || '', limit: Number(q.limit) || 60 }),
          customerStore.outboxSummary()
        ]);
        return res.status(200).json({ success: true, data, ringkasan, ...customerStore.getStorageInfo() });
      }

      const [data, ringkasan] = await Promise.all([
        customerStore.listCustomers({
          segmen: q.segmen || '',
          q: q.q || '',
          limit: Number(q.limit) || 200,
          offset: Number(q.offset) || 0,
          hanyaOptIn: String(q.optIn || '') === '1'
        }),
        customerStore.getCustomerStats()
      ]);

      return res.status(200).json({ success: true, data, ringkasan, ...customerStore.getStorageInfo() });
    }

    if (req.method === 'POST') {
      const body = bodyJson(req);
      const aksi = String(body.aksi || '').toLowerCase();

      if (aksi === 'optin' || aksi === 'optout') {
        const hasil = await customerStore.setOptIn(
          body.wa || body.wa_number, aksi === 'optin', 'Diubah dari dashboard admin'
        );
        if (!hasil) return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan.' });
        return res.status(200).json({ success: true, message: 'Status izin dihubungi diperbarui.', data: hasil });
      }

      if (aksi === 'pratinjau-followup') {
        const data = await waFollowup.jalankanHarian({ dryRun: true, limitKirim: 0 });
        return res.status(200).json({ success: true, data });
      }

      if (aksi === 'jalankan-followup') {
        const data = await waFollowup.jalankanHarian({
          dryRun: false,
          limitKirim: Number(body.limitKirim) || 40
        });
        return res.status(200).json({ success: true, data });
      }

      if (aksi === 'kirim-antrean') {
        const data = await waFollowup.kirimOutboxJatuhTempo({ limit: Number(body.limit) || 20 });
        return res.status(200).json({ success: true, data });
      }

      return res.status(400).json({
        success: false,
        message: 'Aksi tidak dikenal. Gunakan: optin, optout, pratinjau-followup, jalankan-followup, kirim-antrean.'
      });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error('/api/customers error:', err);
    return res.status(500).json({
      success: false,
      message: (err && err.message) || 'Terjadi kesalahan pada server'
    });
  }
};