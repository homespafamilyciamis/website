// ============================================================
// HOME SPA FAMILY — Data layer otomasi & pelaporan
// Tabel: public.automation_rules, public.broadcasts, public.analytics_reports
// View : v_omset_harian, v_layanan_tren, v_jam_sibuk, v_pelanggan_ringkas
//
// Dipakai oleh: waFollowup.js, analyst.js, api/automation.js,
//               api/broadcast.js, api/analytics.js, api/cron/*.js
// ============================================================

const RULES = 'automation_rules';
const BROADCASTS = 'broadcasts';
const REPORTS = 'analytics_reports';

let supabase = null;
let supabaseError = '';

function getSupabase() {
  if (supabase) return supabase;
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  if (!url || !key) {
    supabaseError = 'SUPABASE_URL / KEY belum diisi.';
    return null;
  }
  try {
    // eslint-disable-next-line global-require
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return supabase;
  } catch (err) {
    supabaseError = 'Gagal load @supabase/supabase-js: ' + (err && err.message);
    return null;
  }
}

function isSupabaseEnabled() {
  return Boolean(getSupabase());
}

function getStorageInfo() {
  if (getSupabase()) return { storage: 'supabase', rules: RULES, broadcasts: BROADCASTS };
  return { storage: 'unavailable', note: supabaseError || 'Supabase belum dikonfigurasi.' };
}

function requireDb() {
  const db = getSupabase();
  if (!db) throw new Error('Supabase belum dikonfigurasi: ' + supabaseError);
  return db;
}

function dateKeyWIB(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

function isoDaysAgo(days) {
  return new Date(Date.now() - Number(days || 0) * 86400000).toISOString();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ------------------------------------------------------------
// Saklar aturan otomasi
// ------------------------------------------------------------

async function getRules() {
  const db = requireDb();
  const { data, error } = await db.from(RULES).select('*').order('key', { ascending: true });
  if (error) throw new Error('Gagal mengambil aturan otomasi: ' + error.message);
  return data || [];
}

async function getRule(key) {
  const db = requireDb();
  const { data, error } = await db.from(RULES).select('*').eq('key', key).maybeSingle();
  if (error) throw new Error('Gagal mengambil aturan ' + key + ': ' + error.message);
  return data || null;
}

async function updateRule(key, patch = {}) {
  const db = requireDb();

  const allowed = {};
  if (patch.is_on !== undefined) allowed.is_on = Boolean(patch.is_on);
  if (patch.config !== undefined) allowed.config = patch.config;
  if (patch.last_run_at !== undefined) allowed.last_run_at = patch.last_run_at;
  if (patch.last_result !== undefined) allowed.last_result = String(patch.last_result).slice(0, 300);
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from(RULES)
    .update(allowed)
    .eq('key', key)
    .select('*')
    .maybeSingle();

  if (error) throw new Error('Gagal memperbarui aturan ' + key + ': ' + error.message);
  return data || null;
}

// ------------------------------------------------------------
// Campaign broadcast
// ------------------------------------------------------------

async function listBroadcasts({ status = '', limit = 50 } = {}) {
  const db = requireDb();
  let query = db.from(BROADCASTS).select('*');
  if (status) query = query.eq('status', status);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)));

  if (error) throw new Error('Gagal mengambil campaign: ' + error.message);
  return data || [];
}

async function getBroadcast(id) {
  const db = requireDb();
  const { data, error } = await db.from(BROADCASTS).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('Gagal mengambil campaign: ' + error.message);
  return data || null;
}

async function createBroadcast(campaign = {}) {
  const db = requireDb();

  const row = {
    nama: String(campaign.nama || 'Broadcast').slice(0, 160),
    pesan: String(campaign.pesan || '').slice(0, 4000),
    target_filter: campaign.target_filter || {},
    schedule_at: campaign.schedule_at || null,
    status: campaign.status || 'draft',
    sumber: campaign.sumber === 'ai' ? 'ai' : 'admin',
    catatan: campaign.catatan ? String(campaign.catatan).slice(0, 900) : null,
    total_target: toNumber(campaign.total_target),
    updated_at: new Date().toISOString()
  };

  if (!row.pesan.trim()) throw new Error('Isi pesan campaign tidak boleh kosong');

  const { data, error } = await db.from(BROADCASTS).insert(row).select('*').single();
  if (error) throw new Error('Gagal membuat campaign: ' + error.message);
  return data;
}

async function updateBroadcast(id, patch = {}) {
  const db = requireDb();

  const allowed = {};
  ['nama', 'pesan', 'status', 'sumber', 'catatan', 'target_filter', 'schedule_at',
    'total_target', 'total_sent', 'approved_by', 'approved_at'].forEach((key) => {
    if (patch[key] !== undefined) allowed[key] = patch[key];
  });
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from(BROADCASTS)
    .update(allowed)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw new Error('Gagal memperbarui campaign: ' + error.message);
  return data || null;
}

/** Campaign yang sudah disetujui & sudah waktunya dikirim. */
async function getApprovedDueBroadcasts(limit = 5) {
  const db = requireDb();

  const { data, error } = await db
    .from(BROADCASTS)
    .select('*')
    .eq('status', 'disetujui')
    .or('schedule_at.is.null,schedule_at.lte.' + new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(20, Number(limit) || 5)));

  if (error) throw new Error('Gagal mengambil campaign disetujui: ' + error.message);
  return data || [];
}

// ------------------------------------------------------------
// Laporan analisis AI
// ------------------------------------------------------------

async function saveReport(report = {}) {
  const db = requireDb();

  const row = {
    periode: report.periode || 'mingguan',
    period_start: report.period_start || null,
    period_end: report.period_end || null,
    metrics: report.metrics || {},
    ringkasan: report.ringkasan ? String(report.ringkasan).slice(0, 4000) : null,
    temuan: report.temuan || [],
    opsi: report.opsi || [],
    model: report.model || null
  };

  const { data, error } = await db.from(REPORTS).insert(row).select('*').single();
  if (error) throw new Error('Gagal menyimpan laporan: ' + error.message);
  return data;
}

async function listReports(limit = 20) {
  const db = requireDb();
  const { data, error } = await db
    .from(REPORTS)
    .select('id, periode, period_start, period_end, ringkasan, temuan, opsi, model, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, Number(limit) || 20)));

  if (error) throw new Error('Gagal mengambil laporan: ' + error.message);
  return data || [];
}

async function getLatestReport() {
  const db = requireDb();
  const { data, error } = await db
    .from(REPORTS)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error('Gagal mengambil laporan terbaru: ' + error.message);
  return (data && data[0]) || null;
}

// ------------------------------------------------------------
// Metrik nyata untuk laporan AI
// Semua angka dihitung dari database (view SQL), bukan oleh model AI.
// ------------------------------------------------------------

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function addDays(dateKey, days) {
  const d = new Date(dateKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

/** Senin sebagai awal pekan (samakan dengan date_trunc('week') di Postgres). */
function startOfWeekKey(dateKey) {
  const d = new Date(dateKey + 'T00:00:00Z');
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

/** Perubahan dalam persen (aman saat pembanding nol). */
function persen(sekarang, sebelumnya) {
  const a = toNumber(sekarang);
  const b = toNumber(sebelumnya);
  if (!b) return a ? 100 : 0;
  return Math.round(((a - b) / b) * 1000) / 10;
}

function jumlahkan(rows, filterFn, field) {
  return (rows || [])
    .filter(filterFn)
    .reduce((sum, row) => sum + toNumber(row[field]), 0);
}

async function collectMetrics() {
  const db = requireDb();

  const hariIni = dateKeyWIB();
  const sejak56 = addDays(hariIni, -55);
  const mingguIni = startOfWeekKey(hariIni);
  const mingguLalu = addDays(mingguIni, -7);

  const mingguIniMulai = addDays(hariIni, -6);
  const mingguLaluMulai = addDays(hariIni, -13);
  const mingguLaluSelesai = addDays(hariIni, -7);
  const d28Mulai = addDays(hariIni, -27);
  const d28LaluMulai = addDays(hariIni, -55);
  const d28LaluSelesai = addDays(hariIni, -28);

  const hitung = (tabel) => db.from(tabel).select('id', { count: 'exact', head: true });

  const [harianRes, layananRes, jamRes, ringkasRes, chatRes, outboxRes,
    totalRes, baruRes, tanpaBookingRes, repeatRes] = await Promise.all([
    db.from('v_omset_harian').select('*').gte('hari', sejak56).order('hari', { ascending: true }),
    db.from('v_layanan_tren').select('*').gte('minggu', sejak56).order('minggu', { ascending: true }),
    db.from('v_jam_sibuk').select('*'),
    db.from('v_pelanggan_ringkas').select('*').limit(1),
    db.from('wa_messages').select('created_at, sender_type, chat_id').gte('created_at', isoDaysAgo(28)),
    db.from('wa_outbox').select('kind, status, created_at').gte('created_at', isoDaysAgo(28)),
    hitung('customers'),
    hitung('customers').gte('first_seen', isoDaysAgo(7)),
    hitung('customers').eq('total_bookings', 0).gte('last_seen', isoDaysAgo(7)),
    hitung('customers').gte('total_bookings', 2)
  ]);

  const cekGagal = (nama, res) => {
    if (res && res.error) throw new Error('Gagal mengambil ' + nama + ': ' + res.error.message);
  };
  cekGagal('omset harian', harianRes);
  cekGagal('tren layanan', layananRes);
  cekGagal('jam sibuk', jamRes);
  cekGagal('ringkasan pelanggan', ringkasRes);
  cekGagal('riwayat chat', chatRes);
  cekGagal('antrean pesan', outboxRes);

  const harian = harianRes.data || [];
  const layanan = layananRes.data || [];
  const jam = jamRes.data || [];
  const chat = chatRes.data || [];
  const outbox = outboxRes.data || [];
  const ringkas = (ringkasRes.data && ringkasRes.data[0]) || {};

  const dalamRentang = (row, mulai, selesai) => row.hari >= mulai && row.hari <= selesai;
  const omset = (mulai, selesai) => jumlahkan(harian, (r) => dalamRentang(r, mulai, selesai), 'omset');

  const omset7 = omset(mingguIniMulai, hariIni);
  const omset7Lalu = omset(mingguLaluMulai, mingguLaluSelesai);
  const omset28 = omset(d28Mulai, hariIni);
  const omset28Lalu = omset(d28LaluMulai, d28LaluSelesai);

  // Booking 7 hari terakhir per status
  const r7 = harian.filter((r) => dalamRentang(r, mingguIniMulai, hariIni));
  const bookingMingguIni = {
    total_booking: jumlahkan(r7, () => true, 'total_booking'),
    selesai: jumlahkan(r7, () => true, 'selesai'),
    terkonfirmasi: jumlahkan(r7, () => true, 'terkonfirmasi'),
    menunggu: jumlahkan(r7, () => true, 'menunggu'),
    dibatalkan: jumlahkan(r7, () => true, 'dibatalkan')
  };
  bookingMingguIni.rasio_dibatalkan_persen = bookingMingguIni.total_booking
    ? Math.round((bookingMingguIni.dibatalkan / bookingMingguIni.total_booking) * 1000) / 10
    : 0;

  // Omset per hari (7 hari terakhir, urut kronologis)
  const omsetHarian = [];
  for (let i = 6; i >= 0; i -= 1) {
    const key = addDays(hariIni, -i);
    const row = harian.find((r) => r.hari === key);
    const d = new Date(key + 'T00:00:00Z');
    omsetHarian.push({
      hari: key,
      nama_hari: NAMA_HARI[d.getUTCDay()],
      omset: row ? toNumber(row.omset) : 0,
      total_booking: row ? toNumber(row.total_booking) : 0,
      dibatalkan: row ? toNumber(row.dibatalkan) : 0
    });
  }

  // Tren layanan: pekan ini vs pekan lalu (paling menurun di urutan atas)
  const petaLayanan = (mingguKey) => {
    const map = {};
    layanan.filter((r) => r.minggu === mingguKey).forEach((r) => {
      map[r.layanan] = { booking: toNumber(r.total_booking), omset: toNumber(r.omset) };
    });
    return map;
  };
  const lIni = petaLayanan(mingguIni);
  const lLalu = petaLayanan(mingguLalu);
  const layananTren = Array.from(new Set([...Object.keys(lIni), ...Object.keys(lLalu)]))
    .map((nama) => ({
      layanan: nama,
      booking_minggu_ini: lIni[nama] ? lIni[nama].booking : 0,
      booking_minggu_lalu: lLalu[nama] ? lLalu[nama].booking : 0,
      omset_minggu_ini: lIni[nama] ? lIni[nama].omset : 0,
      perubahan_booking_persen: persen(
        lIni[nama] ? lIni[nama].booking : 0,
        lLalu[nama] ? lLalu[nama].booking : 0
      )
    }))
    .sort((a, b) => a.perubahan_booking_persen - b.perubahan_booking_persen)
    .slice(0, 8);

  // Jam tersibuk / tersepi / belum terisi (jam operasional 08.00-21.00)
  const petaJam = {};
  jam.forEach((r) => {
    const key = String(r.jam || '').padStart(2, '0');
    petaJam[key] = toNumber(r.total_booking);
  });
  const jamOperasional = [];
  for (let h = 8; h <= 21; h += 1) jamOperasional.push(String(h).padStart(2, '0'));
  const jamUrut = jamOperasional.map((h) => ({ jam: h + ':00', total_booking: petaJam[h] || 0 }));

  const pesanPelanggan = chat.filter((r) => r.sender_type === 'customer').length;
  const kirimPerJenis = {};
  outbox.forEach((r) => {
    const key = r.kind || 'lain';
    kirimPerJenis[key] = (kirimPerJenis[key] || 0) + 1;
  });

  return {
    periode: {
      dari: mingguIniMulai,
      sampai: hariIni,
      pekan_ini_mulai: mingguIni,
      pekan_lalu_mulai: mingguLalu
    },
    omset: {
      tujuh_hari: omset7,
      tujuh_hari_sebelumnya: omset7Lalu,
      perubahan_persen: persen(omset7, omset7Lalu),
      duapuluh_delapan_hari: omset28,
      duapuluh_delapan_hari_sebelumnya: omset28Lalu,
      perubahan_persen_28_hari: persen(omset28, omset28Lalu)
    },
    booking_tujuh_hari: bookingMingguIni,
    omset_harian_tujuh_hari: omsetHarian,
    layanan_tren: layananTren,
    jam_sibuk: [...jamUrut].sort((a, b) => b.total_booking - a.total_booking).slice(0, 3),
    jam_sepi: [...jamUrut].sort((a, b) => a.total_booking - b.total_booking).slice(0, 5),
    jam_tanpa_booking: jamUrut.filter((j) => j.total_booking === 0).map((j) => j.jam),
    pelanggan: {
      total: toNumber(ringkas.total_pelanggan) || (totalRes && totalRes.count) || 0,
      baru_tujuh_hari: (baruRes && baruRes.count) || 0,
      pernah_booking_dua_kali_atau_lebih: (repeatRes && repeatRes.count) || 0,
      chat_tanpa_booking_tujuh_hari: (tanpaBookingRes && tanpaBookingRes.count) || 0,
      aktif: toNumber(ringkas.aktif),
      pasif: toNumber(ringkas.pasif),
      hangat: toNumber(ringkas.hangat),
      opt_out: toNumber(ringkas.opt_out),
      total_belanja_tercatat: toNumber(ringkas.total_belanja)
    },
    chat_28_hari: {
      total_pesan: chat.length,
      pesan_pelanggan: pesanPelanggan,
      pesan_eva: chat.length - pesanPelanggan,
      jumlah_percakapan: new Set(chat.map((r) => r.chat_id)).size
    },
    otomasi_28_hari: {
      total: outbox.length,
      terkirim: outbox.filter((r) => r.status === 'sent').length,
      gagal: outbox.filter((r) => r.status === 'failed').length,
      per_jenis: kirimPerJenis
    },
    catatan:
      'Seluruh angka dihitung langsung dari database Supabase Home Spa Family ' +
      '(bukan perkiraan model AI).'
  };
}

module.exports = {
  RULES,
  BROADCASTS,
  REPORTS,
  getStorageInfo,
  isSupabaseEnabled,
  dateKeyWIB,
  isoDaysAgo,
  addDays,
  startOfWeekKey,
  persen,
  getRules,
  getRule,
  updateRule,
  listBroadcasts,
  getBroadcast,
  createBroadcast,
  updateBroadcast,
  getApprovedDueBroadcasts,
  saveReport,
  listReports,
  getLatestReport,
  collectMetrics
};