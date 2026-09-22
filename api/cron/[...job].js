// ============================================================
// Vercel Cron: /api/cron/<job>
//   /api/cron/daily  -> setiap hari 03:00 UTC = 10:00 WIB
//   /api/cron/weekly -> setiap Senin 03:00 UTC = 10:00 WIB
//
// Satu fungsi catch-all untuk 2 job (hemat batas Serverless Function
// paket Vercel Hobby). Pengamanan: CRON_SECRET (fail-closed).
// ============================================================
const JOB = {
  daily: require('../../otomasi/cronDaily'),
  weekly: require('../../otomasi/cronWeekly')
};

function ambilJob(req) {
  const dariQuery = req.query && req.query.job;
  const nilai = Array.isArray(dariQuery) ? dariQuery[0] : (dariQuery || (req.params && req.params.job));
  return String(nilai || '').toLowerCase();
}

module.exports = async function handler(req, res) {
  const job = ambilJob(req);
  const target = JOB[job];

  if (!target) {
    return res.status(404).json({
      success: false,
      message: 'Cron tidak dikenal: "' + (job || '-') + '". Gunakan daily atau weekly.'
    });
  }

  return target(req, res);
};