// ============================================================
// Vercel Serverless: /api/broadcast  (butuh ADMIN_KEY)
//
// GET                                             -> daftar campaign
// POST { aksi:'pratinjau', pesan, filter }        -> hitung target + contoh pesan
// POST { aksi:'buat', nama, pesan, filter, ... }  -> simpan sebagai draft
// POST { aksi:'setujui', id }                     -> setujui & siapkan antrean
// POST { aksi:'kirim', id, limit }                -> kirim antrean campaign
// POST { aksi:'batalkan', id }                    -> batalkan campaign
//
// Campaign TIDAK pernah terkirim tanpa status "disetujui".
// ============================================================
const automationStore = require('../automationStore');
const customerStore = require('../customerStore');
const waFollowup = require('../waFollowup');
const { cekAdmin, bodyJson } = require('../apiGuard');

/** Filter selalu dibatasi ke pelanggan yang bersedia dihubungi. */
function filterAman(filter) {
  const hasil = Object.assign({ limit: 40 }, (filter && typeof filter === 'object') ? filter : {});
  hasil.hanyaOptIn = true;
  hasil.limit = Math.max(1, Math.min(200, Number(hasil.limit) || 40));
  return hasil;
}

module.exports = async function handler(req, res) {
  if (!cekAdmin(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized: ADMIN_KEY salah.' });
  }

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const data = await automationStore.listBroadcasts({
        status: q.status || '',
        limit: Number(q.limit) || 50
      });
      return res.status(200).json({ success: true, data, ...automationStore.getStorageInfo() });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const body = bodyJson(req);
    const aksi = String(body.aksi || '').toLowerCase();

    if (aksi === 'pratinjau') {
      const filter = filterAman(body.filter);
      const target = await customerStore.selectTargets(filter);
      const namaContoh = (target[0] && target[0].nama) ? String(target[0].nama).split(/\s+/)[0] : 'Kak';
      const contoh = waFollowup
        .render(body.pesan || '', {
          layanan: target[0] ? (target[0].last_service || 'treatment') : 'treatment'
        })
        .replace(/\{name\}/g, namaContoh);

      return res.status(200).json({
        success: true,
        data: {
          jumlah_target: target.length,
          filter,
          contoh_pesan: contoh,
          contoh_penerima: target.slice(0, 5).map((t) => ({
            nama: t.nama,
            segmen: t.segmen,
            wa: customerStore.maskNumber(t.wa_number)
          }))
        }
      });
    }

    if (aksi === 'buat') {
      const filter = filterAman(body.filter);
      const target = await customerStore.selectTargets(filter);
      const campaign = await automationStore.createBroadcast({
        nama: body.nama || 'Broadcast manual',
        pesan: body.pesan,
        target_filter: filter,
        schedule_at: body.schedule_at || null,
        status: body.langsungSetujui ? 'disetujui' : 'menunggu_approval',
        sumber: 'admin',
        catatan: body.catatan || '',
        total_target: target.length
      });
      return res.status(201).json({ success: true, data: campaign, jumlah_target: target.length });
    }

    if (aksi === 'setujui') {
      const id = Number(body.id);
      const campaign = await automationStore.getBroadcast(id);
      if (!campaign) {
        return res.status(404).json({ success: false, message: 'Campaign tidak ditemukan.' });
      }

      const disetujui = await automationStore.updateBroadcast(id, {
        status: 'disetujui',
        approved_by: String(body.oleh || 'admin').slice(0, 80),
        approved_at: new Date().toISOString()
      });

      const susun = await waFollowup.susunBroadcastCampaign(disetujui);
      const tersimpan = await customerStore.enqueueOutbox(susun.items);
      await automationStore.updateBroadcast(id, { total_target: susun.items.length });

      return res.status(200).json({
        success: true,
        message: 'Campaign disetujui. Antrean akan dikirim oleh cron atau tombol Kirim.',
        data: disetujui,
        jumlah_target: susun.items.length,
        antrean_baru: tersimpan.length
      });
    }

    if (aksi === 'kirim') {
      const id = Number(body.id);
      const campaign = await automationStore.getBroadcast(id);
      if (!campaign) {
        return res.status(404).json({ success: false, message: 'Campaign tidak ditemukan.' });
      }
      if (campaign.status !== 'disetujui') {
        return res.status(400).json({
          success: false,
          message: 'Campaign harus disetujui dulu (status saat ini: ' + campaign.status + ').'
        });
      }

      const susun = await waFollowup.susunBroadcastCampaign(campaign);
      const tersimpan = await customerStore.enqueueOutbox(susun.items);
      const hasil = await waFollowup.kirimOutboxJatuhTempo({ limit: Number(body.limit) || 60 });
      const sisa = await customerStore.hitungAntreanCampaign(id, 'queued');

      if (!sisa) {
        const totalTerkirim = await customerStore.hitungAntreanCampaign(id, 'sent');
        await automationStore.updateBroadcast(id, { status: 'terkirim', total_sent: totalTerkirim });
      }

      return res.status(200).json({
        success: true,
        message: sisa
          ? 'Terkirim sebagian, sisa ' + sisa + ' pesan akan dilanjutkan.'
          : 'Campaign selesai dikirim.',
        antrean_baru: tersimpan.length,
        sisa_antrean: sisa,
        hasil
      });
    }

    if (aksi === 'batalkan') {
      const id = Number(body.id);
      const campaign = await automationStore.getBroadcast(id);
      if (!campaign) {
        return res.status(404).json({ success: false, message: 'Campaign tidak ditemukan.' });
      }
      const dibatalkan = await automationStore.updateBroadcast(id, { status: 'dibatalkan' });
      return res.status(200).json({ success: true, message: 'Campaign dibatalkan.', data: dibatalkan });
    }

    return res.status(400).json({
      success: false,
      message: 'Aksi tidak dikenal. Gunakan: pratinjau, buat, setujui, kirim, batalkan.'
    });
  } catch (err) {
    console.error('/api/broadcast error:', err);
    return res.status(500).json({
      success: false,
      message: (err && err.message) || 'Terjadi kesalahan pada server'
    });
  }
};