// ============================================================
// LOGIKA CRON: /api/cron/weekly
// Dipanggil oleh fungsi catch-all: api/cron/[...job].js
// Dijadwalkan setiap Senin 03:00 UTC = 10:00 WIB (lihat vercel.json).
//
// Tugas: kumpulkan metrik nyata (omset, layanan, jam kosong, pelanggan,
// chat) -> minta analisis ke Gemini -> simpan laporan + kirim ringkasan
// ke grup WhatsApp admin.
//
// Uji manual: /api/cron/weekly?secret=<CRON_SECRET>
// ============================================================
const analyst = require('../analyst');
const waGroup = require('../waGroup');
const { cekCron } = require('../apiGuard');

module.exports = async function handler(req, res) {
  if (!cekCron(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized: CRON_SECRET salah.' });
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(200).json({
      success: false,
      message: 'GEMINI_API_KEY belum diisi — laporan analisis AI dilewati.'
    });
  }

  try {
    const hasil = await analyst.buatDanSimpanLaporan({ apiKey, periode: 'mingguan' });

    let laporanGrup = null;
    if (hasil.laporan) {
      try {
        const kirim = await waGroup.sendToGroup(analyst.teksLaporanWhatsApp(hasil.laporan));
        laporanGrup = kirim.ok ? 'terkirim' : ('gagal: ' + kirim.reason);
      } catch (err) {
        laporanGrup = 'gagal: ' + ((err && err.message) || 'error');
      }
    }

    const data = {
      ok: hasil.ok,
      error: hasil.error || '',
      laporan_id: hasil.laporan ? hasil.laporan.id : null,
      ringkasan: hasil.laporan ? hasil.laporan.ringkasan : '',
      jumlah_temuan: hasil.laporan && Array.isArray(hasil.laporan.temuan) ? hasil.laporan.temuan.length : 0,
      jumlah_opsi: hasil.laporan && Array.isArray(hasil.laporan.opsi) ? hasil.laporan.opsi.length : 0,
      model: hasil.laporan ? hasil.laporan.model : null,
      laporan_grup: laporanGrup
    };

    console.log('[cron/weekly]', JSON.stringify(data));
    return res.status(200).json({ success: hasil.ok, data });
  } catch (err) {
    console.error('[cron/weekly] error:', err);
    return res.status(500).json({
      success: false,
      message: (err && err.message) || 'Terjadi kesalahan pada cron mingguan'
    });
  }
};