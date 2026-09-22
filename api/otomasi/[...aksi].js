// ============================================================
// Vercel Serverless: /api/otomasi/<aksi>   (butuh ADMIN_KEY)
//
// Satu fungsi catch-all untuk 4 endpoint admin otomasi:
//   /api/otomasi/customers   -> pelanggan + antrean pesan
//   /api/otomasi/broadcast   -> campaign broadcast
//   /api/otomasi/automation  -> saklar aturan otomasi
//   /api/otomasi/analytics   -> laporan analisis AI
//
// Alasan digabung: paket Vercel Hobby membatasi jumlah Serverless
// Function per deployment, sehingga 4 endpoint tidak dibuat sebagai
// 4 file terpisah di dalam folder api/.
// ============================================================
const RUTE = {
  customers: require('../../otomasi/customers'),
  broadcast: require('../../otomasi/broadcast'),
  automation: require('../../otomasi/automation'),
  analytics: require('../../otomasi/analytics')
};

function ambilAksi(req) {
  const dariQuery = req.query && req.query.aksi;
  const nilai = Array.isArray(dariQuery) ? dariQuery[0] : (dariQuery || (req.params && req.params.aksi));
  return String(nilai || '').toLowerCase();
}

module.exports = async function handler(req, res) {
  const aksi = ambilAksi(req);
  const target = RUTE[aksi];

  if (!target) {
    return res.status(404).json({
      success: false,
      message: 'Aksi otomasi tidak dikenal: "' + (aksi || '-') +
        '". Gunakan customers, broadcast, automation, atau analytics.'
    });
  }

  return target(req, res);
};