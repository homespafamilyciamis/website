// ============================================================
// LOGIKA CRON: /api/cron/daily
// Dipanggil oleh fungsi catch-all: api/cron/[...job].js
// Dijadwalkan setiap hari 03:00 UTC = 10:00 WIB (lihat vercel.json).
//
// Tugas: susun follow-up (3 hari, reaktivasi, reminder H-1, broadcast
// harian) -> masukkan ke antrean -> kirim yang jatuh tempo ->
// laporkan ringkasannya ke grup WhatsApp admin.
//
// Pengamanan: CRON_SECRET (Vercel otomatis mengirim header
// "Authorization: Bearer <CRON_SECRET>").
//
// Uji manual (tanpa mengirim apa pun):
//   /api/cron/daily?dryRun=1&secret=<CRON_SECRET>
// ============================================================
const waFollowup = require('../waFollowup');
const waGroup = require('../waGroup');
const { cekCron } = require('../apiGuard');

module.exports = async function handler(req, res) {
  if (!cekCron(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized: CRON_SECRET salah.' });
  }

  const q = req.query || {};
  const dryRun = String(q.dryRun || '') === '1';
  const limitKirim = Number(q.limit || process.env.WA_LIMIT_KIRIM || 40) || 40;

  try {
    const ringkasan = await waFollowup.jalankanHarian({ dryRun, limitKirim });

    // Ringkasan harian ke grup admin (bisa dimatikan: WA_LAPORAN_HARIAN=0)
    if (!dryRun && String(process.env.WA_LAPORAN_HARIAN || '1') !== '0') {
      try {
        const kirim = await waGroup.sendToGroup(waFollowup.teksRingkasan(ringkasan));
        ringkasan.laporan_grup = kirim.ok ? 'terkirim' : ('gagal: ' + kirim.reason);
      } catch (err) {
        ringkasan.laporan_grup = 'gagal: ' + ((err && err.message) || 'error');
      }
    }

    console.log('[cron/daily]', JSON.stringify(ringkasan));
    return res.status(200).json({ success: true, data: ringkasan });
  } catch (err) {
    console.error('[cron/daily] error:', err);
    return res.status(500).json({
      success: false,
      message: (err && err.message) || 'Terjadi kesalahan pada cron harian'
    });
  }
};