// ============================================================
// HOME SPA FAMILY — Analis Bisnis AI (untuk ADMIN/pemilik)
//
// Mengubah metrik nyata (automationStore.collectMetrics) menjadi:
//   - ringkasan kondisi bisnis
//   - temuan penting (mis. omset turun, jam kosong, pelanggan pasif)
//   - beberapa OPSI AKSI yang bisa langsung dijalankan
//
// PENTING: prompt di sini terpisah dari prompt "Eva" (eva.js) yang
// menjawab pelanggan. Jangan digabung — audiensnya berbeda.
// ============================================================

const { generateText, parseJsonReply } = require('./geminiClient');
const automationStore = require('./automationStore');
const customerStore = require('./customerStore');

const ANALYST_SYSTEM_PROMPT = `
IDENTITAS
Kamu adalah "Analis Bisnis WhatsApp" untuk Home Spa Family, spa & salon keluarga
di Jalan Otista, Perum Bumi Ciharalang Lestari, Cijeungjing - Ciamis.
Jam operasional 08.00-21.00 WIB setiap hari, melayani salon/studio dan home service.
Kamu berbicara kepada PEMILIK/ADMIN, bukan kepada pelanggan.

SUMBER DATA
- Kamu menerima objek JSON bernama METRIK, semuanya dihitung langsung dari database.
- Gunakan HANYA angka yang ada di METRIK. Jangan mengarang angka, layanan, atau harga.
- Bila sebuah metrik nol/kosong, katakan apa adanya (data belum cukup),
  jangan menebak atau mengarang penyebab yang tidak didukung data.

TUGAS
1. Ringkas kondisi bisnis: omset, jumlah booking, kondisi pelanggan, aktivitas chat.
2. Sebutkan 3-5 temuan paling penting dan paling mendesak, misalnya:
   - layanan yang turun/naik tajam,
   - jam/hari yang kosong (peluang promo),
   - rasio pembatalan tinggi,
   - pelanggan lama yang tidak kembali,
   - chat yang tidak berujung booking.
3. Berikan 3-5 OPSI AKSI yang realistis untuk spa kecil, misalnya:
   follow-up WhatsApp, promo jam sepi, bundling paket, reaktivasi pelanggan lama,
   optimasi layanan yang menurun.
   Setiap opsi WAJIB memuat: alasan berbasis angka, langkah konkret, estimasi dampak
   dalam rupiah (sebutkan asumsinya), tingkat usaha, dan risiko.
4. Bila omset menurun, jelaskan dugaan penyebab berdasarkan angka METRIK
   (layanan mana, hari mana, jam mana, status booking mana).

HARGA RESMI (jangan menyebut harga di luar daftar ini)
Body massage 120.000 | Pijat ibu hamil 200.000/jam | Facial 100.000 |
Face massage + masker 100.000 | Facial + masker 150.000 | Creambath 100.000 |
Masker rambut 85.000 | Scrub 100.000 | Kerokan 30.000 | Cuci catok 30.000 |
Gurah mata 150.000 | Bekam 300.000 | Paket Manja 230.000 (1,5 jam) | Paket Rilex 210.000 (1,5 jam)

BATASAN PENTING
- Sistem hanya boleh mengirim maksimal 1 pesan otomatis per pelanggan per hari,
  dan pelanggan yang meminta berhenti tidak boleh dihubungi. Jangan menyarankan spam.
- Jangan menyarankan diskon di luar harga resmi tanpa menyebutkannya sebagai usulan
  kebijakan baru.
- Bahasa Indonesia, ringkas, langsung ke inti, tanpa basa-basi dan tanpa sapaan panjang.

FORMAT JAWABAN
Balas HANYA dengan JSON valid (tanpa penjelasan tambahan, tanpa code fence) berstruktur:
{
  "ringkasan": "2-3 kalimat kondisi bisnis",
  "temuan": ["temuan 1", "temuan 2", "temuan 3"],
  "opsi_aksi": [
    {
      "judul": "judul singkat opsi",
      "alasan": "didukung angka dari METRIK",
      "langkah": ["langkah 1", "langkah 2"],
      "dampak_estimasi": "Rp ... (asumsi: ...)",
      "effort": "kecil | sedang | besar",
      "risiko": "rendah | sedang | tinggi",
      "aksi": {
        "tipe": "buat_broadcast",
        "filter": { "segmen": "pasif", "limit": 40 },
        "pesan": "Halo Kak {name}, ... (pakai {name} untuk menyapa)"
      }
    }
  ],
  "prioritas_minggu_ini": ["prioritas 1", "prioritas 2"]
}

CATATAN "aksi"
- Gunakan tipe "buat_broadcast" HANYA bila opsi memang perlu menghubungi pelanggan.
- Field filter boleh berisi: segmen ("baru"|"aktif"|"pasif"|"hangat"),
  pernahBooking (true/false), minHariSejakBooking, minHariSejakPesan, limit.
- Pesan broadcast maksimal 480 karakter, personal, sopan, dan menyertakan {name}.
- Sistem akan menyimpan opsi ini sebagai DRAFT yang harus disetujui admin dulu,
  jadi jangan menganggap pesan sudah terkirim.
`;

/** Normalisasi & validasi hasil JSON dari model. */
function rapikanHasil(parsed) {
  const daftarTemuan = Array.isArray(parsed.temuan) ? parsed.temuan : [];
  const daftarOpsi = Array.isArray(parsed.opsi_aksi) ? parsed.opsi_aksi : [];

  return {
    ringkasan: String(parsed.ringkasan || '').slice(0, 2000),
    temuan: daftarTemuan.map((t) => String(t).slice(0, 500)).slice(0, 8),
    opsi_aksi: daftarOpsi.slice(0, 6).map((opsi) => ({
      judul: String((opsi && opsi.judul) || 'Opsi tanpa judul').slice(0, 200),
      alasan: String((opsi && opsi.alasan) || '').slice(0, 900),
      langkah: (Array.isArray(opsi && opsi.langkah) ? opsi.langkah : [])
        .map((l) => String(l).slice(0, 300)).slice(0, 6),
      dampak_estimasi: String((opsi && opsi.dampak_estimasi) || '').slice(0, 300),
      effort: String((opsi && opsi.effort) || 'sedang').toLowerCase().slice(0, 10),
      risiko: String((opsi && opsi.risiko) || 'sedang').toLowerCase().slice(0, 10),
      aksi: opsi && opsi.aksi && opsi.aksi.tipe === 'buat_broadcast'
        ? {
          tipe: 'buat_broadcast',
          filter: (opsi.aksi.filter && typeof opsi.aksi.filter === 'object') ? opsi.aksi.filter : {},
          pesan: String(opsi.aksi.pesan || '').slice(0, 1000)
        }
        : null
    })),
    prioritas_minggu_ini: (Array.isArray(parsed.prioritas_minggu_ini) ? parsed.prioritas_minggu_ini : [])
      .map((p) => String(p).slice(0, 300)).slice(0, 6)
  };
}

/**
 * Minta analisis ke Gemini berdasarkan metrik nyata.
 * @returns {Promise<{ok:boolean, model:string, error:string, ringkasan?:string, temuan?:Array, opsi_aksi?:Array}>}
 */
async function buatAnalisis({ apiKey, metrics, timeoutMs = 20000, maxOutputTokens = 2400 } = {}) {
  const hasil = await generateText({
    apiKey,
    systemPrompt: ANALYST_SYSTEM_PROMPT,
    contents: [{
      role: 'user',
      parts: [{
        text:
          'METRIK (JSON):\n' + JSON.stringify(metrics) +
          '\n\nBuat ringkasan, temuan, dan opsi aksi sesuai format JSON yang diminta.'
      }]
    }],
    timeoutMs,
    maxOutputTokens,
    responseMimeType: 'application/json'
  });

  if (!hasil.text) {
    return { ok: false, model: hasil.model, error: hasil.error || 'Model tidak mengembalikan jawaban' };
  }

  const parsed = parseJsonReply(hasil.text);
  if (!parsed) {
    return {
      ok: false,
      model: hasil.model,
      error: 'Balasan model bukan JSON valid',
      mentah: String(hasil.text).slice(0, 800)
    };
  }

  return Object.assign({ ok: true, model: hasil.model, error: '' }, rapikanHasil(parsed));
}

/**
 * Kumpulkan metrik -> minta analisis AI -> simpan ke analytics_reports.
 * Bila AI gagal, metrik tetap disimpan agar terlihat di /admin.
 */
async function buatDanSimpanLaporan({ apiKey, periode = 'mingguan' } = {}) {
  const metrics = await automationStore.collectMetrics();
  const analisis = await buatAnalisis({ apiKey, metrics });

  if (!analisis.ok) {
    const laporan = await automationStore.saveReport({
      periode,
      period_start: metrics.periode.dari,
      period_end: metrics.periode.sampai,
      metrics,
      ringkasan: 'Analisis AI gagal: ' + analisis.error,
      temuan: [],
      opsi: [],
      model: analisis.model || null
    });
    return { ok: false, error: analisis.error, laporan, metrics };
  }

  const laporan = await automationStore.saveReport({
    periode,
    period_start: metrics.periode.dari,
    period_end: metrics.periode.sampai,
    metrics,
    ringkasan: analisis.ringkasan,
    temuan: analisis.temuan,
    opsi: analisis.opsi_aksi,
    model: analisis.model
  });

  return { ok: true, error: '', laporan, metrics, analisis };
}

/**
 * Ubah opsi aksi dari AI menjadi DRAFT campaign broadcast
 * (status "menunggu_approval" — admin harus menyetujui dulu).
 */
async function buatDraftCampaignDariOpsi(opsi, { dibuatOleh = 'admin' } = {}) {
  const aksi = (opsi && opsi.aksi) || null;
  if (!aksi || aksi.tipe !== 'buat_broadcast') {
    throw new Error('Opsi ini tidak memuat aksi broadcast yang bisa dijalankan.');
  }

  const pesan = String(aksi.pesan || '').trim();
  if (!pesan) throw new Error('Opsi tidak menyertakan isi pesan broadcast.');

  // Opsi dari AI dibatasi: selalu hanya pelanggan opt-in, batas target wajar.
  const filter = Object.assign({}, aksi.filter || {});
  delete filter.hanyaOptIn;
  filter.hanyaOptIn = true;
  filter.limit = Math.max(1, Math.min(200, Number(filter.limit) || 40));

  const target = await customerStore.selectTargets(filter);
  const campaign = await automationStore.createBroadcast({
    nama: String(opsi.judul || 'Broadcast dari AI').slice(0, 160),
    pesan,
    target_filter: filter,
    status: 'menunggu_approval',
    sumber: 'ai',
    catatan: String(opsi.alasan || '').slice(0, 900),
    total_target: target.length
  });

  return { campaign, jumlah_target: target.length, dibuat_oleh: dibuatOleh };
}

/** Teks ringkas laporan untuk dikirim ke grup WhatsApp admin. */
function teksLaporanWhatsApp(laporan) {
  if (!laporan) return 'Belum ada laporan analisis.';

  const baris = [];
  baris.push('📊 *Laporan Analisis Eva AI*');
  if (laporan.period_start && laporan.period_end) {
    baris.push('Periode: ' + laporan.period_start + ' s/d ' + laporan.period_end);
  }
  if (laporan.ringkasan) baris.push('', laporan.ringkasan);

  if (Array.isArray(laporan.temuan) && laporan.temuan.length) {
    baris.push('', '*Temuan:*');
    laporan.temuan.forEach((t) => baris.push('• ' + t));
  }

  const opsi = Array.isArray(laporan.opsi) ? laporan.opsi : [];
  if (opsi.length) {
    baris.push('', '*Opsi tindakan:*');
    opsi.forEach((o, i) => {
      baris.push((i + 1) + '. *' + o.judul + '*');
      if (o.alasan) baris.push('   ' + o.alasan);
      if (o.dampak_estimasi) baris.push('   Estimasi: ' + o.dampak_estimasi);
    });
  }

  if (laporan.id) {
    baris.push('', 'Buka dashboard admin untuk melihat detail & menyetujui opsi.');
  }

  return baris.join('\n');
}

module.exports = {
  ANALYST_SYSTEM_PROMPT,
  rapikanHasil,
  buatAnalisis,
  buatDanSimpanLaporan,
  buatDraftCampaignDariOpsi,
  teksLaporanWhatsApp
};