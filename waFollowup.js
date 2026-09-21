// ============================================================
// HOME SPA FAMILY — Mesin follow-up & broadcast otomatis
//
// Tugas:
//   1. Menyusun daftar target follow-up sesuai aturan (3 hari, reaktivasi,
//      reminder H-1, broadcast harian) -> semua masuk ke wa_outbox.
//   2. Mengirim isi wa_outbox yang sudah jatuh tempo lewat Fonnte.
//
// Aturan keselamatan yang selalu dipakai:
//   - hanya pelanggan opt-in
//   - maksimal 1 pesan otomatis per pelanggan per hari
//   - batas jumlah follow-up per bulan (diatur di automation_rules)
//   - nomor admin/grup tidak pernah dihubungi
//   - {name} dibiarkan sebagai placeholder agar Fonnte yang mengganti
//     per nomor (pesan tetap personal walau dikirim massal)
// ============================================================

const customerStore = require('./customerStore');
const automationStore = require('./automationStore');
const waBlast = require('./waBlast');

const TEMPLATE = {
  review:
    'Halo Kak {name} 😊\n' +
    'Terima kasih sudah treatment *{layanan}* di Home Spa Family.\n' +
    'Bagaimana rasa nyamannya setelah treatment, Kak? Kalau puas, boleh banget ' +
    'minta bintang 5-nya 🙏\n' +
    'Kalau ada masukan, balas saja di chat ini ya. Mau sekalian jadwalkan ' +
    'treatment berikutnya?',
  hangat:
    'Halo Kak {name} 😊\n' +
    'Sebelumnya sempat tanya soal *{layanan}* di Home Spa Family, sudah ada ' +
    'gambaran jadwalnya, Kak?\n' +
    'Kalau mau, saya bantu cek slot yang masih kosong. Tinggal balas tanggal ' +
    'dan jam favoritnya ya.',
  reaktivasi:
    'Halo Kak {name} 🌸\n' +
    'Sudah lama tidak treatment ya, kami kangen Kakak di Home Spa Family.\n' +
    'Mau coba *{layanan}* lagi? Boleh balas tanggalnya, saya bantu cek jadwal ' +
    'yang masih kosong.',
  reminder:
    'Halo Kak {name}, ini pengingat jadwal ya 🙏\n' +
    'Besok: *{layanan}* jam {jam}\n' +
    'Lokasi: {lokasi}\n' +
    'Kalau ada perubahan, balas chat ini ya. Sampai ketemu besok, Kak!',
  umum:
    'Halo Kak {name} 😊\n' +
    'Ada yang bisa kami bantu untuk treatment di Home Spa Family? ' +
    'Jam operasional kami 08.00-21.00 WIB setiap hari, di salon maupun ' +
    'layanan panggilan ke rumah.'
};

/**
 * Isi template. {name} sengaja TIDAK diganti di sini supaya Fonnte
 * menggantinya per nomor saat pengiriman massal.
 */
function render(template, vars = {}) {
  return String(template || '')
    .replace(/\{(\w+)\}/g, (match, key) => {
      const kunci = String(key).toLowerCase();
      if (kunci === 'name') return '{name}';
      const nilai = vars[kunci];
      if (nilai === undefined || nilai === null || String(nilai) === '') return '';
      return String(nilai);
    })
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Sudah pernah dihubungi otomasi hari ini? (maks 1 pesan/hari/orang) */
function sudahDihubungiHariIni(state, hariIni) {
  if (!state || !state.last_contact_at) return false;
  const tanggal = new Date(state.last_contact_at);
  if (Number.isNaN(tanggal.getTime())) return false;
  return customerStore.dateKeyWIB(tanggal) === hariIni;
}

/** Keterangan lokasi untuk pengingat jadwal. */
function keteranganLokasi(booking) {
  const teks = String((booking && booking.service) || '').toLowerCase();
  const homeService = /panggil|home\s*service|ke\s*rumah|terapis\s*datang/.test(teks);
  if (homeService) {
    return booking && booking.alamat ? 'rumah Kakak (' + booking.alamat + ')' : 'rumah Kakak';
  }
  return 'salon Home Spa Family, Jalan Otista, Cijeruk/Cijeungjing - Ciamis';
}

let cacheCacheDikecualikan = null;
function dikecualikan(waNumber) {
  if (!cacheCacheDikecualikan) cacheCacheDikecualikan = waBlast.nomorDikecualikan();
  return cacheCacheDikecualikan.has(String(waNumber || '').replace(/\D/g, ''));
}

// ------------------------------------------------------------
// Penyusun daftar follow-up (hanya menyusun, belum mengirim)
// ------------------------------------------------------------

/** Bentuk 1 baris antrean (mengikuti struktur tabel wa_outbox). */
function barisAntrean({ customer, waNumber, nama, kind, templateKey, campaignId, pesan, dedupeKey, sendAt, vars }) {
  return {
    customer_id: customer ? customer.id : null,
    wa_number: waNumber || (customer ? customer.wa_number : ''),
    nama: nama || (customer ? customer.nama : '') || null,
    kind,
    template_key: templateKey,
    campaign_id: campaignId || null,
    message: pesan,
    vars: vars || {},
    send_at: sendAt || new Date().toISOString(),
    dedupe_key: dedupeKey
  };
}

/**
 * FOLLOW-UP 3 HARI setelah layanan selesai -> tanya pengalaman + minta review.
 * Target: booking berstatus "Selesai" dengan tanggal layanan = H-3 (bisa diatur).
 */
async function susunReview(rule, { hariIni, maxJalan = 25 } = {}) {
  if (!rule || !rule.is_on) return { jenis: 'review', items: [], catatan: 'nonaktif' };

  const cfg = rule.config || {};
  const delayHari = Number(cfg.delay_hari || 3);
  const maksPerBulan = Number(cfg.max_per_bulan || 3);

  // eslint-disable-next-line global-require
  const bookingStore = require('./bookingStore');
  const bookings = await bookingStore.getAllBookings();
  const tanggalTarget = automationStore.addDays(hariIni, -delayHari);

  const kandidat = (bookings || [])
    .filter((b) => b.status === 'Selesai' && String(b.tanggal) === tanggalTarget)
    .slice(0, maxJalan);

  const items = [];
  const dilewati = [];

  for (const booking of kandidat) {
    const wa = customerStore.normalizeWa(booking.whatsapp);
    if (!wa || dikecualikan(wa)) { dilewati.push('nomor kosong/dikecualikan'); continue; }

    const state = await customerStore.getContactState(wa);
    if (!state || state.opt_in === false) { dilewati.push('belum opt-in'); continue; }
    if (sudahDihubungiHariIni(state, hariIni)) { dilewati.push('sudah dihubungi hari ini'); continue; }
    if (state.followup_month === customerStore.monthKeyWIB()
      && Number(state.followup_count) >= maksPerBulan) {
      dilewati.push('batas follow-up bulan ini'); continue;
    }

    items.push(barisAntrean({
      customer: state,
      kind: 'review',
      templateKey: 'review',
      pesan: render(TEMPLATE.review, { layanan: booking.service || 'treatment' }),
      dedupeKey: 'review:' + booking.id + ':' + wa,
      vars: { name: state.nama || booking.nama || 'Kak', layanan: booking.service || 'treatment' }
    }));
  }

  return { jenis: 'review', jumlah_kandidat: kandidat.length, items, dilewati };
}

/** PENGINGAT H-1 untuk booking yang sudah terkonfirmasi. */
async function susunReminder(rule, { hariIni, maxJalan = 25 } = {}) {
  if (!rule || !rule.is_on) return { jenis: 'reminder', items: [], catatan: 'nonaktif' };

  // eslint-disable-next-line global-require
  const bookingStore = require('./bookingStore');
  const bookings = await bookingStore.getAllBookings();
  const besok = automationStore.addDays(hariIni, 1);

  const kandidat = (bookings || [])
    .filter((b) => b.status === 'Terkonfirmasi' && String(b.tanggal) === besok)
    .slice(0, maxJalan);

  const items = [];
  const dilewati = [];

  for (const booking of kandidat) {
    const wa = customerStore.normalizeWa(booking.whatsapp);
    if (!wa || dikecualikan(wa)) { dilewati.push('nomor kosong/dikecualikan'); continue; }

    const state = await customerStore.getContactState(wa);
    if (!state || state.opt_in === false) { dilewati.push('belum opt-in'); continue; }
    if (sudahDihubungiHariIni(state, hariIni)) { dilewati.push('sudah dihubungi hari ini'); continue; }

    items.push(barisAntrean({
      customer: state,
      kind: 'reminder',
      templateKey: 'reminder',
      pesan: render(TEMPLATE.reminder, {
        layanan: booking.service || 'treatment',
        jam: String(booking.jam || '').slice(0, 5) || '-',
        lokasi: keteranganLokasi(booking)
      }),
      dedupeKey: 'reminder:' + booking.id + ':' + wa,
      vars: { name: state.nama || booking.nama || 'Kak' }
    }));
  }

  return { jenis: 'reminder', jumlah_kandidat: kandidat.length, items, dilewati };
}

/**
 * FOLLOW-UP 3 HARI untuk pelanggan yang pernah chat tetapi belum booking
 * (lead hangat). Dikirim ulang paling banyak `max_ke` kali.
 */
async function susunHangat(rule, { hariIni, maxJalan = 20 } = {}) {
  if (!rule || !rule.is_on) return { jenis: 'hangat', items: [], catatan: 'nonaktif' };

  const cfg = rule.config || {};
  const delayHari = Number(cfg.delay_hari || 3);
  const maksKe = Number(cfg.max_ke || 2);

  const targets = await customerStore.selectTargets({
    pernahBooking: false,
    minHariSejakPesan: delayHari,
    minHariSejakKontak: delayHari,
    maksFollowupBulanIni: maksKe,
    limit: maxJalan
  });

  const items = [];
  const dilewati = [];

  for (const customer of targets) {
    const wa = customerStore.normalizeWa(customer.wa_number);
    if (!wa || dikecualikan(wa)) { dilewati.push('nomor dikecualikan'); continue; }
    if (sudahDihubungiHariIni(customer, hariIni)) { dilewati.push('sudah dihubungi hari ini'); continue; }

    items.push(barisAntrean({
      customer,
      kind: 'followup',
      templateKey: 'hangat',
      pesan: render(TEMPLATE.hangat, { layanan: customer.last_service || 'treatment' }),
      dedupeKey: 'hangat:' + wa + ':' + hariIni,
      vars: { name: customer.nama || 'Kak', layanan: customer.last_service || 'treatment' }
    }));
  }

  return { jenis: 'hangat', jumlah_kandidat: targets.length, items, dilewati };
}

/**
 * REAKTIVASI pelanggan lama (sudah pernah booking, lama tidak kembali).
 * Dibatasi maksimal 1x per pekan per pelanggan.
 */
async function susunReaktivasi(rule, { hariIni, maxJalan = 40 } = {}) {
  if (!rule || !rule.is_on) return { jenis: 'reaktivasi', items: [], catatan: 'nonaktif' };

  const cfg = rule.config || {};
  const minHari = Number(cfg.min_hari || 21);
  const maksPerBulan = Number(cfg.max_per_bulan || 2);

  const targets = await customerStore.selectTargets({
    segmen: 'pasif',
    pernahBooking: true,
    minHariSejakBooking: minHari,
    minHariSejakKontak: 7,
    maksFollowupBulanIni: maksPerBulan,
    limit: maxJalan
  });

  const pekan = automationStore.startOfWeekKey(hariIni);
  const items = [];
  const dilewati = [];

  for (const customer of targets) {
    const wa = customerStore.normalizeWa(customer.wa_number);
    if (!wa || dikecualikan(wa)) { dilewati.push('nomor dikecualikan'); continue; }
    if (sudahDihubungiHariIni(customer, hariIni)) { dilewati.push('sudah dihubungi hari ini'); continue; }

    items.push(barisAntrean({
      customer,
      kind: 'followup',
      templateKey: 'reaktivasi',
      pesan: render(TEMPLATE.reaktivasi, { layanan: customer.last_service || 'treatment' }),
      dedupeKey: 'reaktivasi:' + wa + ':' + pekan,
      vars: { name: customer.nama || 'Kak', layanan: customer.last_service || 'treatment' }
    }));
  }

  return { jenis: 'reaktivasi', jumlah_kandidat: targets.length, items, dilewati };
}

/** Nomor hari WIB: 1 = Senin ... 7 = Minggu (samakan dengan config di SQL). */
function hariKeWIB(dateKey) {
  const d = new Date(dateKey + 'T00:00:00Z');
  const dow = d.getUTCDay();
  return dow === 0 ? 7 : dow;
}

/**
 * BROADCAST HARIAN (10.00 WIB) ke segmen bergilir.
 * Segmen berbeda tiap hari (lihat config segmen_per_hari) supaya tidak
 * semua pelanggan menerima promosi setiap hari.
 */
async function susunBroadcastHarian(rule, { hariIni, maxJalan } = {}) {
  if (!rule || !rule.is_on) return { jenis: 'broadcast_harian', items: [], catatan: 'nonaktif' };

  const cfg = rule.config || {};
  const maxPerHari = Number(maxJalan || cfg.max_per_hari || 40);
  const segmenHariIni = (cfg.segmen_per_hari && cfg.segmen_per_hari[String(hariKeWIB(hariIni))]) || 'pasif';
  const pesanTemplate = String(cfg.pesan || TEMPLATE.umum);

  const targets = await customerStore.selectTargets({
    segmen: segmenHariIni,
    minHariSejakKontak: Number(cfg.min_hari_sejak_kontak || 7),
    maksFollowupBulanIni: Number(cfg.maks_followup_bulan || 4),
    limit: maxPerHari
  });

  const items = [];
  const dilewati = [];

  for (const customer of targets) {
    const wa = customerStore.normalizeWa(customer.wa_number);
    if (!wa || dikecualikan(wa)) { dilewati.push('nomor dikecualikan'); continue; }
    if (sudahDihubungiHariIni(customer, hariIni)) { dilewati.push('sudah dihubungi hari ini'); continue; }

    items.push(barisAntrean({
      customer,
      kind: 'broadcast',
      templateKey: 'broadcast_harian',
      pesan: render(pesanTemplate, {
        layanan: customer.last_service || 'treatment',
        nama: customer.nama || 'Kak'
      }),
      dedupeKey: 'broadcast-harian:' + wa + ':' + hariIni,
      vars: { name: customer.nama || 'Kak', layanan: customer.last_service || 'treatment' }
    }));
  }

  return { jenis: 'broadcast_harian', segmen: segmenHariIni, jumlah_kandidat: targets.length, items, dilewati };
}

/**
 * BROADCAST dari campaign yang sudah DISETUJUI admin
 * (termasuk draft yang dibuat AI, setelah di-approve).
 */
async function susunBroadcastCampaign(campaign, { maxJalan = 200 } = {}) {
  const filter = Object.assign({ limit: maxJalan }, campaign.target_filter || {});
  const targets = await customerStore.selectTargets(filter);
  const items = [];

  for (const customer of targets) {
    const wa = customerStore.normalizeWa(customer.wa_number);
    if (!wa || dikecualikan(wa)) continue;

    items.push(barisAntrean({
      customer,
      kind: 'broadcast',
      templateKey: 'campaign_' + campaign.id,
      campaignId: campaign.id,
      pesan: render(campaign.pesan, {
        layanan: customer.last_service || 'treatment',
        nama: customer.nama || 'Kak'
      }),
      dedupeKey: 'campaign:' + campaign.id + ':' + wa,
      vars: { name: customer.nama || 'Kak', layanan: customer.last_service || 'treatment' }
    }));
  }

  return { jenis: 'campaign', campaign_id: campaign.id, jumlah_kandidat: targets.length, items, dilewati: [] };
}

// ------------------------------------------------------------
// Pengiriman isi antrean
// ------------------------------------------------------------

// Urutan prioritas bila 1 pelanggan punya beberapa pesan sekaligus.
const PRIORITAS = { reminder: 0, review: 1, followup: 2, broadcast: 3, admin: 4 };

/** Jadwal 10.00 WIB hari berikutnya (untuk menunda pesan, dalam ISO/UTC). */
function jadwalBesok(hariIni) {
  const dasar = new Date((hariIni || customerStore.dateKeyWIB()) + 'T03:00:00Z');
  dasar.setUTCDate(dasar.getUTCDate() + 1);
  return dasar.toISOString();
}

async function tandai(id, status, extra = {}) {
  try {
    await customerStore.markOutboxResult(id, status, extra);
  } catch (err) {
    console.error('[waFollowup] gagal menandai antrean', id, err && err.message);
  }
}

/**
 * Kirim semua antrean yang sudah jatuh tempo.
 * Aturan: maksimal 1 pesan per nomor per proses; sisanya ditunda ke
 * 10.00 WIB besok agar tidak menumpuk di hari yang sama.
 */
async function kirimOutboxJatuhTempo({ limit = 40, dryRun = false, jeda, mulainya } = {}) {
  const items = await customerStore.getDueOutbox(limit);
  if (!items.length) return { total: 0, dikirim: 0, gagal: 0, ditunda: 0, errors: [] };

  const urut = [...items].sort((a, b) => {
    const pa = PRIORITAS[a.kind] === undefined ? 9 : PRIORITAS[a.kind];
    const pb = PRIORITAS[b.kind] === undefined ? 9 : PRIORITAS[b.kind];
    return pa - pb;
  });

  const besok = jadwalBesok(customerStore.dateKeyWIB());
  const dipilih = [];
  const sudahAda = new Set();
  let ditunda = 0;

  for (const item of urut) {
    const wa = customerStore.normalizeWa(item.wa_number);
    if (!wa || dikecualikan(wa)) {
      await tandai(item.id, 'skipped', { error: 'nomor dikecualikan' });
      continue;
    }
    if (sudahAda.has(wa)) {
      await tandai(item.id, 'queued', { attempt: 0, sendAt: besok, error: 'ditunda: sudah ada pesan lain hari ini' });
      ditunda += 1;
      continue;
    }
    sudahAda.add(wa);
    dipilih.push(Object.assign({}, item, { wa_number: wa, vars: item.vars || {} }));
  }

  if (!dipilih.length) return { total: items.length, dikirim: 0, gagal: 0, ditunda, errors: [] };

  const payload = dipilih.map((item) => ({
    wa_number: item.wa_number,
    message: item.message,
    nama: item.nama,
    vars: Object.assign({ name: item.nama || 'Kak' }, item.vars)
  }));

  const hasil = dryRun
    ? await waBlast.sendBatch(payload, { dryRun: true })
    : await waBlast.sendBatch(payload, { jeda, mulaiPada: mulainya });

  const petaItem = new Map(dipilih.map((item) => [item.wa_number, item]));
  let dikirim = 0;
  let gagal = 0;

  for (const grup of hasil.groups || []) {
    const nomorGrup = grup.wa_numbers && grup.wa_numbers.length
      ? grup.wa_numbers
      : [];

    for (const wa of nomorGrup) {
      const item = petaItem.get(wa);
      if (!item) continue;

      if (grup.ok) {
        dikirim += 1;
        await tandai(item.id, 'sent', { providerId: (grup.ids || []).join(',') });
        try {
          await customerStore.markContacted(wa);
        } catch (err) {
          console.error('[waFollowup] gagal mencatat kontak', err && err.message);
        }
      } else {
        gagal += 1;
        await tandai(item.id, 'failed', {
          error: grup.reason || 'gagal kirim',
          attempt: (Number(item.attempts) || 0) + 1
        });
      }
    }
  }

  return {
    total: items.length,
    dikirim,
    gagal,
    ditunda,
    errors: hasil.errors || [],
    detail: hasil.dryRun ? 'pratinjau (tidak dikirim)' : hasil.ok ? 'semua batch diterima Fonnte' : 'sebagian gagal'
  };
}

// ------------------------------------------------------------
// Orkestrasi harian (dipanggil /api/cron/daily)
// ------------------------------------------------------------

/**
 * Jalankan seluruh otomasi harian:
 *   1. segarkan segmen pelanggan
 *   2. susun follow-up (3 hari, reaktivasi, reminder H-1, broadcast harian)
 *   3. susun campaign yang sudah disetujui
 *   4. simpan ke wa_outbox (anti-dobel)
 *   5. kirim yang jatuh tempo
 */
async function jalankanHarian({ dryRun = false, limitKirim = 40, maxJalan } = {}) {
  const hariIni = customerStore.dateKeyWIB();
  const ringkasan = {
    hari: hariIni,
    dryRun,
    segmen_diperbarui: 0,
    aturan: {},
    disusun: 0,
    dikirim: null,
    errors: []
  };

  try {
    ringkasan.segmen_diperbarui = await customerStore.segarkanSegmen();
  } catch (err) {
    ringkasan.errors.push('segmen: ' + (err && err.message));
  }

  let rules = [];
  try {
    rules = await automationStore.getRules();
  } catch (err) {
    ringkasan.errors.push('aturan: ' + (err && err.message));
    return ringkasan;
  }

  const petaRule = {};
  rules.forEach((rule) => { petaRule[rule.key] = rule; });

  const penyusun = [
    ['reminder_h1', () => susunReminder(petaRule.reminder_h1, { hariIni, maxJalan })],
    ['followup_review', () => susunReview(petaRule.followup_review, { hariIni, maxJalan })],
    ['followup_hangat', () => susunHangat(petaRule.followup_hangat, { hariIni, maxJalan })],
    ['reactivation', () => susunReaktivasi(petaRule.reactivation, { hariIni, maxJalan })],
    ['broadcast_harian', () => susunBroadcastHarian(petaRule.broadcast_harian, { hariIni, maxJalan })]
  ];

  const semuaItem = [];

  for (const pasangan of penyusun) {
    const key = pasangan[0];
    if (!petaRule[key] || !petaRule[key].is_on) {
      ringkasan.aturan[key] = 'nonaktif';
      continue;
    }
    try {
      const hasil = await pasangan[1]();
      ringkasan.aturan[key] = {
        kandidat: hasil.jumlah_kandidat || 0,
        disusun: hasil.items.length,
        segmen: hasil.segmen || null
      };
      semuaItem.push(...hasil.items);
    } catch (err) {
      ringkasan.aturan[key] = 'gagal: ' + (err && err.message);
      ringkasan.errors.push(key + ': ' + (err && err.message));
    }
  }

  // Campaign yang sudah DISETUJUI admin (termasuk draft dari AI)
  try {
    const campaigns = await automationStore.getApprovedDueBroadcasts(3);
    for (const campaign of campaigns) {
      const hasil = await susunBroadcastCampaign(campaign);
      ringkasan.aturan['campaign_' + campaign.id] = {
        nama: campaign.nama,
        kandidat: hasil.jumlah_kandidat,
        disusun: hasil.items.length
      };
      semuaItem.push(...hasil.items);
    }
  } catch (err) {
    ringkasan.errors.push('campaign: ' + (err && err.message));
  }

  // Simpan ke antrean
  if (dryRun) {
    ringkasan.disusun = semuaItem.length;
    ringkasan.pratinjau = semuaItem.slice(0, 5).map((item) => ({
      nomor: customerStore.maskNumber(item.wa_number),
      jenis: item.kind,
      pesan: item.message.slice(0, 180)
    }));
  } else if (semuaItem.length) {
    try {
      const tersimpan = await customerStore.enqueueOutbox(semuaItem);
      ringkasan.disusun = semuaItem.length;
      ringkasan.tersimpan = tersimpan.length;
    } catch (err) {
      ringkasan.errors.push('antrean: ' + (err && err.message));
    }
  }

  // Kirim yang jatuh tempo (hanya pada jam aman)
  if (!waBlast.jamKirimAman()) {
    ringkasan.dikirim = { catatan: 'Di luar jam kirim aman (08.00-20.00 WIB) — pengiriman dilewati.' };
  } else {
    try {
      ringkasan.dikirim = await kirimOutboxJatuhTempo({ limit: limitKirim, dryRun });
    } catch (err) {
      ringkasan.dikirim = { error: err && err.message };
      ringkasan.errors.push('kirim: ' + (err && err.message));
    }
  }

  // Simpan jejak hasil per aturan (tampil di tab Pengaturan /admin)
  if (!dryRun) {
    for (const rule of rules) {
      const hasil = ringkasan.aturan[rule.key];
      if (hasil === undefined) continue;
      try {
        await automationStore.updateRule(rule.key, {
          last_run_at: new Date().toISOString(),
          last_result: typeof hasil === 'string' ? hasil : JSON.stringify(hasil)
        });
      } catch (_) {
        // tidak fatal
      }
    }
  }

  return ringkasan;
}

/** Ringkasan singkat untuk dikirim ke grup WhatsApp admin. */
function teksRingkasan(ringkasan) {
  const r = ringkasan || {};
  const baris = ['🤖 *Ringkasan Otomasi Eva* — ' + (r.hari || customerStore.dateKeyWIB())];

  if (typeof r.disusun === 'number') baris.push('• Pesan disusun: ' + r.disusun);

  const kirim = r.dikirim || {};
  if (kirim.dikirim !== undefined) {
    baris.push(
      '• Terkirim: ' + kirim.dikirim + ' | Gagal: ' + (kirim.gagal || 0) +
      ' | Ditunda: ' + (kirim.ditunda || 0)
    );
  } else if (kirim.catatan) {
    baris.push('• ' + kirim.catatan);
  } else if (kirim.error) {
    baris.push('• Kirim gagal: ' + kirim.error);
  }

  Object.keys(r.aturan || {}).forEach((key) => {
    const nilai = r.aturan[key];
    if (nilai === 'nonaktif') return;
    if (typeof nilai === 'string') {
      baris.push('• ' + key + ': ' + nilai);
      return;
    }
    baris.push(
      '• ' + key + ': ' + (nilai.disusun || 0) + ' pesan' +
      (nilai.segmen ? ' (segmen ' + nilai.segmen + ')' : '')
    );
  });

  if (r.errors && r.errors.length) baris.push('⚠️ ' + r.errors.join(' | '));
  return baris.join('\n');
}

module.exports = {
  TEMPLATE,
  render,
  hariKeWIB,
  jadwalBesok,
  susunReview,
  susunReminder,
  susunHangat,
  susunReaktivasi,
  susunBroadcastHarian,
  susunBroadcastCampaign,
  kirimOutboxJatuhTempo,
  jalankanHarian,
  teksRingkasan
};