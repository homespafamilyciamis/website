// ============================================================
// Uji otomatis otomasi Eva — TANPA mengirim WhatsApp & TANPA database.
// Supabase & Fonnte ditiru (mock), jadi aman dijalankan kapan saja:
//   node test-otomasi.js
// ============================================================

const customerStore = require('./customerStore');
const automationStore = require('./automationStore');
const waBlast = require('./waBlast');
const waFollowup = require('./waFollowup');
const analyst = require('./analyst');
const geminiClient = require('./geminiClient');
const apiGuard = require('./apiGuard');

let lulus = 0;
let gagal = 0;

function uji(nama, fn) {
  try {
    fn();
    lulus += 1;
    console.log('OK   ' + nama);
  } catch (err) {
    gagal += 1;
    console.log('FAIL ' + nama + ' -> ' + err.message);
  }
}

async function ujiAsync(nama, fn) {
  try {
    await fn();
    lulus += 1;
    console.log('OK   ' + nama);
  } catch (err) {
    gagal += 1;
    console.log('FAIL ' + nama + ' -> ' + err.message);
  }
}

function samaDengan(nyata, harap, pesan) {
  if (nyata !== harap) {
    throw new Error((pesan || 'nilai tidak sama') +
      ' (nyata: ' + JSON.stringify(nyata) + ', harap: ' + JSON.stringify(harap) + ')');
  }
}

function benar(nilai, pesan) {
  if (!nilai) throw new Error(pesan || 'nilai tidak benar');
}

// ---------- Tiruan Fonnte (semua panggilan dicatat, tidak dikirim) ----------
const PERMINTAAN = [];
const balasanFonnte = { status: true, detail: 'success! message in queue', id: ['1'] };

global.fetch = async (url, opsi) => {
  const form = new URLSearchParams(opsi.body);
  PERMINTAAN.push({
    url,
    target: form.get('target'),
    message: form.get('message'),
    delay: form.get('delay'),
    schedule: form.get('schedule'),
    auth: opsi.headers.Authorization
  });
  return { ok: true, status: 200, json: async () => balasanFonnte };
};

// ---------- Tiruan data Supabase ----------
const PELANGGAN_AKTIF = {
  id: 1, wa_number: '628111111111', nama: 'Budi Santoso', segmen: 'pasif', opt_in: true,
  last_seen: '2026-08-01T03:00:00.000Z', last_contact_at: null,
  last_booking_at: '2026-07-01T03:00:00.000Z', total_bookings: 3, total_spend: 500000,
  last_service: 'Body Massage', followup_count: 0, followup_month: null
};
const PELANGGAN_HANGAT = {
  id: 2, wa_number: '628222222222', nama: 'Sari', segmen: 'hangat', opt_in: true,
  last_seen: '2026-09-10T03:00:00.000Z', last_contact_at: null, last_booking_at: null,
  total_bookings: 0, total_spend: 0, last_service: null, followup_count: 0, followup_month: null
};
const PELANGGAN_OPT_OUT = {
  id: 3, wa_number: '628333333333', nama: 'Tutup', segmen: 'pasif', opt_in: false,
  last_seen: null, last_contact_at: null, last_booking_at: '2026-06-01T03:00:00.000Z',
  total_bookings: 1, total_spend: 120000, last_service: 'Facial', followup_count: 0, followup_month: null
};

const TERSIMPAN = [];
const DITANDAI = [];
let ANTREAN = [];

customerStore.selectTargets = async (filter) => {
  benar(filter.hanyaOptIn !== false, 'selectTargets harus selalu opt-in');
  if (filter.pernahBooking === false) return [PELANGGAN_HANGAT];
  return [PELANGGAN_AKTIF, PELANGGAN_HANGAT];
};
customerStore.getContactState = async (wa) => {
  if (wa === PELANGGAN_OPT_OUT.wa_number) return PELANGGAN_OPT_OUT;
  if (wa === PELANGGAN_HANGAT.wa_number) return PELANGGAN_HANGAT;
  return PELANGGAN_AKTIF;
};
customerStore.enqueueOutbox = async (items) => {
  items.forEach((i) => TERSIMPAN.push(i));
  return items.map((i, idx) => ({
    id: idx + 1, wa_number: i.wa_number, dedupe_key: i.dedupe_key, kind: i.kind
  }));
};
customerStore.getDueOutbox = async () => ANTREAN.slice();
customerStore.markOutboxResult = async (id, status, extra) => {
  DITANDAI.push({ id, status, extra: extra || {} });
  return true;
};
customerStore.markContacted = async (wa) => {
  DITANDAI.push({ wa, status: 'contacted' });
  return true;
};

// ---------- Setup env UJI (sebelum modul pertama mem-build cache nomor) ----------
process.env.WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '6285126246175';
process.env.WA_GROUP_ID = '62800000000@g.us'; // dummy, tidak boleh bentrok nomor test
process.env.WA_NOMOR_DIKECUALIKAN = '628999999999';
process.env.FONNTE_TOKEN = process.env.FONNTE_TOKEN || 'TOKEN-UJI'; // agar sendBatch tidak menolak kirim
// paksa cache waBlast/waFollowup (re-)terbangun dari env di atas
delete require.cache[require.resolve('./waBlast')];
delete require.cache[require.resolve('./waFollowup')];

// ---------- Uji ----------
async function jalankan() {
  console.log('--- 1. Normalisasi & helper waktu ---');
  uji('nomor dinormalisasi ke format 62', () => {
    samaDengan(customerStore.normalizeWa('0811-222-333'), '62811222333');
    samaDengan(customerStore.normalizeWa('+62 811 222 333'), '62811222333');
    samaDengan(customerStore.normalizeWa('811222333'), '62811222333');
    samaDengan(customerStore.normalizeWa(''), '');
  });

  uji('jam kirim aman hanya 08.00-20.00 WIB', () => {
    const jamWIB = (jam) => new Date(Date.UTC(2026, 8, 21, jam - 7, 0, 0));
    samaDengan(waBlast.jamKirimAman(jamWIB(9)), true, 'jam 09 WIB');
    samaDengan(waBlast.jamKirimAman(jamWIB(19)), true, 'jam 19 WIB');
    samaDengan(waBlast.jamKirimAman(jamWIB(21)), false, 'jam 21 WIB');
    samaDengan(waBlast.jamKirimAman(jamWIB(3)), false, 'jam 03 WIB');
  });

  uji('hariKeWIB: 1 = Senin, 7 = Minggu', () => {
    samaDengan(waFollowup.hariKeWIB('2026-09-21'), 1, 'Senin');
    samaDengan(waFollowup.hariKeWIB('2026-09-27'), 7, 'Minggu');
  });

  console.log('--- 2. Template pesan ---');
  uji('{name} dipertahankan supaya diganti Fonnte per nomor', () => {
    const pesan = waFollowup.render(waFollowup.TEMPLATE.hangat, { layanan: 'Bekam' });
    benar(pesan.indexOf('{name}') !== -1, '{name} harus tetap ada');
    benar(pesan.indexOf('Bekam') !== -1, 'nama layanan harus terisi');
    samaDengan(pesan.indexOf('{layanan}'), -1, 'placeholder layanan harus hilang');
  });

  uji('nama panggilan = kata pertama saja', () => {
    samaDengan(waBlast.namaPanggilan('Budi Santoso'), 'Budi');
    samaDengan(waBlast.namaPanggilan('   '), 'Kak');
  });

  uji('renderName mengisi {name} untuk kirim tunggal', () => {
    samaDengan(waBlast.renderName('Halo {name}!', 'Sari Dewi'), 'Halo Sari!');
  });

  console.log('--- 3. Penyusunan antrean follow-up ---');
  await ujiAsync('susunHangat: isi antrean + kunci anti-dobel harian', async () => {
    const hasil = await waFollowup.susunHangat(
      { is_on: true, config: { delay_hari: 3, max_ke: 2 } },
      { hariIni: '2026-09-21' }
    );
    samaDengan(hasil.items.length, 1);
    samaDengan(hasil.items[0].kind, 'followup');
    samaDengan(hasil.items[0].dedupe_key, 'hangat:628222222222:2026-09-21');
    benar(hasil.items[0].message.indexOf('{name}') !== -1, 'pesan harus tetap memuat {name}');
  });

  await ujiAsync('susunHangat: aturan nonaktif -> tidak ada item', async () => {
    const hasil = await waFollowup.susunHangat({ is_on: false, config: {} }, { hariIni: '2026-09-21' });
    samaDengan(hasil.items.length, 0);
    samaDengan(hasil.catatan, 'nonaktif');
  });

  await ujiAsync('susunReaktivasi: anti-dobel per pekan', async () => {
    const hasil = await waFollowup.susunReaktivasi(
      { is_on: true, config: { min_hari: 21, max_per_bulan: 2 } },
      { hariIni: '2026-09-21' }
    );
    benar(hasil.items.length >= 1, 'harus ada target');
    benar(/^reaktivasi:628111111111:\d{4}-\d{2}-\d{2}$/.test(hasil.items[0].dedupe_key), 'format kunci pekan');
  });

  await ujiAsync('susunBroadcastHarian: segmen bergilir sesuai hari', async () => {
    const rule = { is_on: true, config: { max_per_hari: 5, segmen_per_hari: { 1: 'pasif', 7: 'baru' } } };
    const senin = await waFollowup.susunBroadcastHarian(rule, { hariIni: '2026-09-21' });
    const minggu = await waFollowup.susunBroadcastHarian(rule, { hariIni: '2026-09-27' });
    samaDengan(senin.segmen, 'pasif');
    samaDengan(minggu.segmen, 'baru');
  });

  await ujiAsync('susunBroadcastCampaign: target sesuai filter campaign', async () => {
    const hasil = await waFollowup.susunBroadcastCampaign({
      id: 7, nama: 'Promo jam sepi', pesan: 'Halo {name}, ada promo jam sepi',
      target_filter: { segmen: 'pasif' }
    });
    samaDengan(hasil.items.length, 2);
    samaDengan(hasil.items[0].dedupe_key, 'campaign:7:628111111111');
    samaDengan(hasil.items[0].campaign_id, 7);
  });

  console.log('--- 4. Pengiriman massal (Fonnte ditiru) ---');
  await ujiAsync('sendBatch: pesan identik -> 1 panggilan, banyak target, jeda acak', async () => {
    PERMINTAAN.length = 0;
    const hasil = await waBlast.sendBatch([
      { wa_number: '628111111111', message: 'Halo {name}, promo ya', nama: 'Budi' },
      { wa_number: '628222222222', message: 'Halo {name}, promo ya', nama: 'Sari' }
    ], { token: 'TOKEN-UJI', jeda: '8-20', staggerDetik: 0 });

    samaDengan(PERMINTAAN.length, 1, 'harus 1 panggilan API');
    samaDengan(PERMINTAAN[0].target, '628111111111|Budi,628222222222|Sari');
    samaDengan(PERMINTAAN[0].message, 'Halo {name}, promo ya');
    samaDengan(PERMINTAAN[0].delay, '8-20');
    samaDengan(PERMINTAAN[0].auth, 'TOKEN-UJI');
    samaDengan(hasil.ok, true);
  });

  await ujiAsync('sendBatch: pesan berbeda -> panggilan terpisah & dijadwalkan bertahap', async () => {
    PERMINTAAN.length = 0;
    await waBlast.sendBatch([
      { wa_number: '628111111111', message: 'Pesan A', nama: 'Budi' },
      { wa_number: '628222222222', message: 'Pesan B', nama: 'Sari' }
    ], { token: 'TOKEN-UJI', staggerDetik: 60 });

    samaDengan(PERMINTAAN.length, 2, 'harus 2 panggilan API');
    benar(PERMINTAAN[1].schedule !== null, 'panggilan kedua harus dijadwalkan');
    samaDengan(PERMINTAAN[0].message, 'Pesan A');
    samaDengan(PERMINTAAN[1].target, '628222222222');
  });

  await ujiAsync('sendBatch: mode pratinjau tidak mengirim apa pun', async () => {
    PERMINTAAN.length = 0;
    const hasil = await waBlast.sendBatch([{ wa_number: '628111111111', message: 'Tes' }], { dryRun: true });
    samaDengan(PERMINTAAN.length, 0, 'tidak boleh ada panggilan API');
    samaDengan(hasil.dryRun, true);
  });

  await ujiAsync('nomor admin / grup / tambahan dikecualikan', async () => {
    samaDengan(waBlast.apakahDikecualikan('6285126246175'), true, 'nomor admin');
    samaDengan(waBlast.apakahDikecualikan('628999999999'), true, 'daftar tambahan');
    samaDengan(waBlast.apakahDikecualikan('628111111111'), false, 'pelanggan biasa');
  });

  console.log('--- 5. Kirim antrean (maksimal 1 pesan per orang per proses) ---');
  await ujiAsync('kirimOutboxJatuhTempo: prioritas & penandaan hasil', async () => {
    DITANDAI.length = 0;
    PERMINTAAN.length = 0;
    ANTREAN = [
      { id: 11, wa_number: '628111111111', nama: 'Budi', kind: 'broadcast', message: 'Promo {name}', vars: { name: 'Budi' }, attempts: 0 },
      { id: 12, wa_number: '628111111111', nama: 'Budi', kind: 'review', message: 'Review {name}', vars: { name: 'Budi' }, attempts: 0 },
      { id: 13, wa_number: '628222222222', nama: 'Sari', kind: 'followup', message: 'Follow {name}', vars: { name: 'Sari' }, attempts: 0 }
    ];

    const hasil = await waFollowup.kirimOutboxJatuhTempo({ limit: 10 });

    samaDengan(hasil.dikirim, 2, 'hanya 1 pesan untuk nomor 628111111111');
    samaDengan(hasil.ditunda, 1, 'pesan kedua untuk nomor sama ditunda');

    benar(Boolean(DITANDAI.find((d) => d.id === 12 && d.status === 'sent')), 'review (prioritas tinggi) dikirim');
    const tunda = DITANDAI.find((d) => d.id === 11 && d.status === 'queued');
    benar(Boolean(tunda), 'broadcast ditunda');
    benar(Boolean(tunda.extra.sendAt), 'harus ada jadwal tunda');
    benar(DITANDAI.some((d) => d.wa === '628222222222' && d.status === 'contacted'), 'kontak dicatat');
  });

  await ujiAsync('kirimOutboxJatuhTempo: antrean kosong tetap aman', async () => {
    ANTREAN = [];
    const hasil = await waFollowup.kirimOutboxJatuhTempo({ limit: 10 });
    samaDengan(hasil.total, 0);
  });

  console.log('--- 6. Analisis AI ---');
  uji('parseJsonReply: tahan pembungkus code fence', () => {
    const hasil = geminiClient.parseJsonReply('```json\n{"ringkasan":"turun 18%"}\n```');
    samaDengan(hasil.ringkasan, 'turun 18%');
  });

  uji('rapikanHasil: merapikan keluaran model', () => {
    const hasil = analyst.rapikanHasil({
      ringkasan: 'Omset turun',
      temuan: ['Bekam -60%'],
      opsi_aksi: [{
        judul: 'Reaktivasi',
        alasan: 'ada 23 pelanggan pasif',
        langkah: ['buat campaign', 'kirim jam 10'],
        dampak_estimasi: 'Rp 1.150.000',
        effort: 'KECIL',
        risiko: 'RENDAH',
        aksi: { tipe: 'buat_broadcast', filter: { segmen: 'pasif' }, pesan: 'Halo {name}' }
      }]
    });
    samaDengan(hasil.opsi_aksi[0].effort, 'kecil');
    samaDengan(hasil.opsi_aksi[0].risiko, 'rendah');
    samaDengan(hasil.opsi_aksi[0].aksi.tipe, 'buat_broadcast');
    samaDengan(hasil.temuan.length, 1);
  });

  uji('rapikanHasil: aksi di luar buat_broadcast dibuang', () => {
    const hasil = analyst.rapikanHasil({ opsi_aksi: [{ judul: 'X', aksi: { tipe: 'hapus_data' } }] });
    samaDengan(hasil.opsi_aksi[0].aksi, null);
  });

  uji('teksLaporanWhatsApp memuat ringkasan & opsi', () => {
    const teks = analyst.teksLaporanWhatsApp({
      id: 1, period_start: '2026-09-15', period_end: '2026-09-21',
      ringkasan: 'Omset turun 18%', temuan: ['Bekam turun'],
      opsi: [{ judul: 'Reaktivasi', alasan: 'ada 23 pasif' }]
    });
    benar(teks.indexOf('turun 18%') !== -1, 'ringkasan ada');
    benar(teks.indexOf('Reaktivasi') !== -1, 'opsi ada');
  });

  console.log('--- 7. Keamanan ---');
  uji('cekAdmin: header & query', () => {
    process.env.ADMIN_KEY = 'RAHASIA';
    samaDengan(apiGuard.cekAdmin({ headers: { 'x-admin-key': 'RAHASIA' }, query: {} }), true);
    samaDengan(apiGuard.cekAdmin({ headers: {}, query: { adminKey: 'RAHASIA' } }), true);
    samaDengan(apiGuard.cekAdmin({ headers: { 'x-admin-key': 'salah' }, query: {} }), false);
    delete process.env.ADMIN_KEY;
    samaDengan(apiGuard.cekAdmin({ headers: {}, query: {} }), true, 'tanpa ADMIN_KEY = mode lama');
  });

  uji('cekCron: Bearer / query / header manual', () => {
    process.env.CRON_SECRET = 'CRON123';
    samaDengan(apiGuard.cekCron({ headers: { authorization: 'Bearer CRON123' }, query: {} }), true);
    samaDengan(apiGuard.cekCron({ headers: {}, query: { secret: 'CRON123' } }), true);
    samaDengan(apiGuard.cekCron({ headers: { 'x-cron-secret': 'CRON123' }, query: {} }), true);
    samaDengan(apiGuard.cekCron({ headers: { authorization: 'Bearer lain' }, query: {} }), false);
    delete process.env.CRON_SECRET;
    samaDengan(apiGuard.cekCron({ headers: {}, query: {} }), false, 'tanpa CRON_SECRET = ditolak (fail-closed)');
  });

  uji('webhook: deteksi STOP & perintah admin grup', () => {
    const berkas = require('fs').readFileSync('api/wa-webhook.js', 'utf8');
    benar(berkas.indexOf('adalahPermintaanBerhenti') !== -1, 'pendeteksi berhenti ada');
    benar(berkas.indexOf('setOptIn(sender, false') !== -1, 'harus mematikan otomasi nomor itu');
    benar(berkas.indexOf('bacaPerintahAdmin') !== -1, 'parser perintah admin ada');
    benar(berkas.indexOf('dariGrupAdmin') !== -1, 'perintah hanya dari grup admin');
    benar(/SETUJU/.test(berkas) && /TOLAK/.test(berkas), 'SETUJU & TOLAK ada');
  });

  uji('teksRingkasan: menyembunyikan aturan nonaktif', () => {
    const teks = waFollowup.teksRingkasan({
      hari: '2026-09-21', disusun: 12,
      dikirim: { dikirim: 10, gagal: 1, ditunda: 1 },
      aturan: { followup_review: { disusun: 4 }, broadcast_harian: 'nonaktif' },
      errors: []
    });
    benar(teks.indexOf('Terkirim: 10') !== -1, 'jumlah terkirim ada');
    samaDengan(teks.indexOf('broadcast_harian'), -1, 'aturan nonaktif disembunyikan');
  });

  console.log('\n== ' + lulus + ' lulus, ' + gagal + ' gagal ==');
  if (gagal > 0) process.exitCode = 1;
}

jalankan();

