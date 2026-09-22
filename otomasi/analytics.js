// ============================================================
// LOGIKA ENDPOINT /api/otomasi/analytics   (butuh ADMIN_KEY)
// Dipanggil oleh fungsi catch-all: api/otomasi/[...aksi].js
//
// GET                                    -> daftar laporan analisis AI
// GET  ?id=12                            -> detail 1 laporan
// POST { aksi:'buat' }                   -> buat laporan sekarang (Gemini)
// POST { aksi:'draft-broadcast', laporanId, indeksOpsi }
//                                        -> jadikan opsi AI sebagai draft campaign
// POST { aksi:'kirim-grup', laporanId }  -> kirim ringkasan ke grup WA admin
// ============================================================
const automationStore = require('../automationStore');
const analyst = require('../analyst');
const waGroup = require('../waGroup');
const { cekAdmin, bodyJson } = require('../apiGuard');

module.exports = async function handler(req, res) {
  if (!cekAdmin(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized: ADMIN_KEY salah.' });
  }

  try {
    if (req.method === 'GET') {
      const q = req.query || {};

      if (q.id) {
        const daftar = await automationStore.listReports(200);
        const laporan = daftar.find((l) => String(l.id) === String(q.id));
        if (!laporan) {
          return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
        }
        return res.status(200).json({ success: true, data: laporan });
      }

      const data = await automationStore.listReports(Number(q.limit) || 10);
      return res.status(200).json({ success: true, data, ...automationStore.getStorageInfo() });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const body = bodyJson(req);
    const aksi = String(body.aksi || '').toLowerCase();

    if (aksi === 'buat') {
      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          message: 'GEMINI_API_KEY belum diisi di server, laporan AI tidak bisa dibuat.'
        });
      }

      const hasil = await analyst.buatDanSimpanLaporan({
        apiKey,
        periode: body.periode === 'harian' ? 'harian' : 'mingguan'
      });

      return res.status(hasil.ok ? 200 : 502).json({
        success: hasil.ok,
        message: hasil.ok ? 'Laporan analisis dibuat.' : ('Gagal membuat analisis: ' + hasil.error),
        data: hasil.laporan || null,
        metrics: hasil.metrics || null,
        error: hasil.error || ''
      });
    }

    if (aksi === 'draft-broadcast') {
      const daftar = await automationStore.listReports(200);
      const laporan = daftar.find((l) => String(l.id) === String(body.laporanId));
      if (!laporan) {
        return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
      }

      const indeks = Number(body.indeksOpsi);
      const opsi = (laporan.opsi || [])[indeks];
      if (!opsi) {
        return res.status(400).json({ success: false, message: 'Opsi tindakan pada indeks tersebut tidak ada.' });
      }

      const hasil = await analyst.buatDraftCampaignDariOpsi(opsi, { dibuatOleh: 'dashboard-admin' });
      return res.status(201).json({
        success: true,
        message: 'Draft campaign dibuat. Setujui dulu di tab Broadcast sebelum dikirim.',
        data: hasil.campaign,
        jumlah_target: hasil.jumlah_target
      });
    }

    if (aksi === 'kirim-grup') {
      const daftar = await automationStore.listReports(200);
      const laporan = daftar.find((l) => String(l.id) === String(body.laporanId));
      if (!laporan) {
        return res.status(404).json({ success: false, message: 'Laporan tidak ditemukan.' });
      }

      const kirim = await waGroup.sendToGroup(analyst.teksLaporanWhatsApp(laporan));
      return res.status(kirim.ok ? 200 : 502).json({
        success: kirim.ok,
        message: kirim.ok ? 'Ringkasan laporan dikirim ke grup admin.' : ('Gagal kirim ke grup: ' + kirim.reason)
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Aksi tidak dikenal. Gunakan: buat, draft-broadcast, kirim-grup.'
    });
  } catch (err) {
    console.error('/api/analytics error:', err);
    return res.status(500).json({
      success: false,
      message: (err && err.message) || 'Terjadi kesalahan pada server'
    });
  }
};