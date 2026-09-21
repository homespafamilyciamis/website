// ============================================================
// HOME SPA FAMILY — Data layer pelanggan & antrean pesan otomatis
// Tabel: public.customers, public.wa_outbox
//
// Dipakai oleh:
//   waFollowup.js          : cari target follow-up & masukkan ke outbox
//   api/cron/daily.js      : ambil antrean jatuh tempo, tandai hasil kirim
//   api/customers.js       : daftar/segmen pelanggan untuk /admin
//   api/broadcast.js       : target campaign broadcast
//
// Catatan: tabel customers otomatis terisi oleh trigger di Supabase
// (lihat supabase.sql bagian 6) setiap ada booking baru atau chat masuk.
// ============================================================

const CUSTOMERS = 'customers';
const OUTBOX = 'wa_outbox';

const SEGMEN = ['baru', 'aktif', 'pasif', 'hangat'];

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
  if (getSupabase()) return { storage: 'supabase', customers: CUSTOMERS, outbox: OUTBOX };
  return { storage: 'unavailable', note: supabaseError || 'Supabase belum dikonfigurasi.' };
}

function requireDb() {
  const db = getSupabase();
  if (!db) throw new Error('Supabase belum dikonfigurasi: ' + supabaseError);
  return db;
}

/** Normalisasi nomor WA apa pun ke format 628xxxxxxxxxx. */
function normalizeWa(num) {
  let s = String(num || '').replace(/\D/g, '');
  if (!s) return '';
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s.startsWith('8')) s = '62' + s;
  if (!s.startsWith('62')) s = '62' + s;
  return s;
}

function maskNumber(num) {
  const s = String(num || '');
  return s.length > 4 ? '****' + s.slice(-4) : '****';
}

/** Tanggal (YYYY-MM-DD) menurut zona waktu WIB. */
function dateKeyWIB(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

/** Bulan (YYYY-MM) menurut zona waktu WIB. */
function monthKeyWIB(d = new Date()) {
  return dateKeyWIB(d).slice(0, 7);
}

/** Jam (0-23) menurut zona waktu WIB. */
function hourWIB(d = new Date()) {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false
  }).format(d);
  return parseInt(h, 10);
}

function isoDaysAgo(days) {
  return new Date(Date.now() - Number(days || 0) * 86400000).toISOString();
}

/**
 * Daftar pelanggan (untuk tab Pelanggan di /admin).
 */
async function listCustomers({ segmen = '', q = '', limit = 200, offset = 0, hanyaOptIn = false } = {}) {
  const db = requireDb();

  let query = db
    .from(CUSTOMERS)
    .select(
      'id, wa_number, nama, alamat, segmen, opt_in, last_seen, last_contact_at, ' +
      'last_booking_at, total_bookings, total_spend, last_service, followup_count'
    );

  if (segmen && SEGMEN.includes(segmen)) query = query.eq('segmen', segmen);
  if (hanyaOptIn) query = query.eq('opt_in', true);
  const keyword = String(q || '').trim();
  if (keyword) {
    const safe = keyword.replace(/[%,()]/g, ' ').trim();
    if (safe) query = query.or(`nama.ilike.%${safe}%,wa_number.ilike.%${safe}%,last_service.ilike.%${safe}%`);
  }

  const { data, error } = await query
    .order('last_seen', { ascending: false, nullsFirst: false })
    .range(offset, offset + Math.max(1, Math.min(500, limit)) - 1);

  if (error) throw new Error('Gagal mengambil pelanggan: ' + error.message);
  return data || [];
}

/** Ringkasan jumlah pelanggan per segmen (view v_pelanggan_ringkas). */
async function getCustomerStats() {
  const db = requireDb();
  const { data, error } = await db.from('v_pelanggan_ringkas').select('*').limit(1);
  if (error) throw new Error('Gagal mengambil ringkasan pelanggan: ' + error.message);
  return (data && data[0]) || {
    total_pelanggan: 0, bisa_dihubungi: 0, opt_out: 0,
    baru: 0, hangat: 0, aktif: 0, pasif: 0, total_belanja: 0
  };
}

/** Aktif/nonaktifkan izin dihubungi (opt-in). */
async function setOptIn(waNumber, optIn, notes = '') {
  const db = requireDb();
  const wa = normalizeWa(waNumber);
  if (!wa) throw new Error('Nomor WA tidak valid');

  const patch = {
    opt_in: Boolean(optIn),
    opt_out_at: optIn ? null : new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (notes) patch.notes = String(notes).slice(0, 500);

  const { data, error } = await db
    .from(CUSTOMERS)
    .update(patch)
    .eq('wa_number', wa)
    .select('id, wa_number, opt_in')
    .maybeSingle();

  if (error) throw new Error('Gagal memperbarui opt-in: ' + error.message);
  return data;
}

/**
 * Pilih target sesuai filter (dipakai broadcast & aturan follow-up).
 *
 * @param {object} filter
 *   segmen             'aktif' | 'pasif' | 'hangat' | 'baru' (boleh array)
 *   pernahBooking      true/false
 *   minHariSejakBooking  booking terakhir sudah >= N hari
 *   maxHariSejakBooking  booking terakhir <= N hari
 *   minHariSejakPesan    chat terakhir sudah >= N hari
 *   minHariSejakKontak   belum dihubungi otomasi >= N hari (termasuk belum pernah)
 *   maksFollowupBulanIni batasi jumlah follow-up per bulan per pelanggan
 *   hanyaOptIn         default true
 *   limit              maksimal target (default 100)
 */
async function selectTargets(filter = {}) {
  const db = requireDb();

  let query = db
    .from(CUSTOMERS)
    .select(
      'id, wa_number, nama, segmen, opt_in, last_seen, last_contact_at, ' +
      'last_booking_at, total_bookings, total_spend, last_service, followup_count, followup_month'
    );

  if (filter.hanyaOptIn !== false) query = query.eq('opt_in', true);

  if (Array.isArray(filter.segmen) && filter.segmen.length) {
    const list = filter.segmen.filter((s) => SEGMEN.includes(s));
    if (list.length) query = query.in('segmen', list);
  } else if (filter.segmen && SEGMEN.includes(filter.segmen)) {
    query = query.eq('segmen', filter.segmen);
  }

  if (filter.pernahBooking === true) query = query.gte('total_bookings', 1);
  if (filter.pernahBooking === false) query = query.eq('total_bookings', 0);

  if (filter.minHariSejakBooking) {
    query = query.lte('last_booking_at', isoDaysAgo(filter.minHariSejakBooking));
  }
  if (filter.maxHariSejakBooking) {
    query = query.gte('last_booking_at', isoDaysAgo(filter.maxHariSejakBooking));
  }
  if (filter.minHariSejakPesan) {
    query = query.lte('last_seen', isoDaysAgo(filter.minHariSejakPesan));
  }
  if (filter.minHariSejakKontak) {
    query = query.or(
      'last_contact_at.is.null,last_contact_at.lte.' + isoDaysAgo(filter.minHariSejakKontak)
    );
  }
  if (filter.maksFollowupBulanIni !== undefined) {
    query = query.or(
      'followup_month.is.null,followup_month.neq.' + monthKeyWIB() +
      ',followup_count.lt.' + (Number(filter.maksFollowupBulanIni) || 0)
    );
  }

  const limit = Math.max(1, Math.min(500, Number(filter.limit) || 100));
  const { data, error } = await query
    .order('last_seen', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error('Gagal memilih target: ' + error.message);
  return data || [];
}

/** Status kontak satu pelanggan (untuk pemeriksaan guardrail). */
async function getContactState(waNumber) {
  const db = requireDb();
  const wa = normalizeWa(waNumber);
  if (!wa) return null;

  const { data, error } = await db
    .from(CUSTOMERS)
    .select('id, wa_number, nama, opt_in, segmen, last_contact_at, followup_count, followup_month')
    .eq('wa_number', wa)
    .maybeSingle();

  if (error) throw new Error('Gagal mengambil status kontak: ' + error.message);
  return data || null;
}

/**
 * Catat bahwa pelanggan baru saja dihubungi otomasi.
 * followup_count direset otomatis saat bulan berganti (WIB).
 */
async function markContacted(waNumber) {
  const db = requireDb();
  const wa = normalizeWa(waNumber);
  if (!wa) return null;

  const state = await getContactState(wa);
  if (!state) return null;

  const month = monthKeyWIB();
  const count = state.followup_month === month ? (Number(state.followup_count) || 0) + 1 : 1;
  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from(CUSTOMERS)
    .update({
      last_contact_at: nowIso,
      followup_count: count,
      followup_month: month,
      updated_at: nowIso
    })
    .eq('wa_number', wa)
    .select('id, last_contact_at, followup_count')
    .maybeSingle();

  if (error) throw new Error('Gagal mencatat kontak: ' + error.message);
  return data;
}

// ------------------------------------------------------------
// Antrean pesan keluar (wa_outbox) — satu pintu untuk semua kiriman
// ------------------------------------------------------------

/**
 * Masukkan pesan ke antrean keluar.
 * `dedupe_key` mencegah pesan dobel saat cron berjalan dua kali
 * untuk periode yang sama (contoh: "review:BK123:628xxxx").
 */
async function enqueueOutbox(items = []) {
  const db = requireDb();

  const rows = (items || [])
    .map((item) => ({
      customer_id: item.customer_id || null,
      wa_number: normalizeWa(item.wa_number),
      nama: item.nama ? String(item.nama).slice(0, 120) : null,
      kind: item.kind || 'followup',
      template_key: item.template_key || null,
      campaign_id: item.campaign_id || null,
      message: String(item.message || '').trim().slice(0, 4000),
      vars: item.vars || {},
      send_at: item.send_at || new Date().toISOString(),
      dedupe_key: item.dedupe_key || null
    }))
    .filter((row) => row.wa_number && row.message);

  if (!rows.length) return [];

  const { data, error } = await db
    .from(OUTBOX)
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('id, wa_number, dedupe_key, kind');

  if (error) throw new Error('Gagal memasukkan ke antrean: ' + error.message);
  return data || [];
}

/** Antrean yang sudah jatuh tempo (siap dikirim). */
async function getDueOutbox(limit = 60) {
  const db = requireDb();

  const { data, error } = await db
    .from(OUTBOX)
    .select(
      'id, customer_id, wa_number, nama, kind, template_key, campaign_id, ' +
      'message, vars, send_at, attempts'
    )
    .eq('status', 'queued')
    .lte('send_at', new Date().toISOString())
    .order('send_at', { ascending: true })
    .limit(Math.max(1, Math.min(300, Number(limit) || 60)));

  if (error) throw new Error('Gagal mengambil antrean: ' + error.message);
  return data || [];
}

/** Tandai hasil pengiriman satu baris antrean. */
async function markOutboxResult(id, status, { providerId = '', error: errText = '', attempt, sendAt } = {}) {
  const db = requireDb();

  const patch = { status };
  if (status === 'sent') patch.sent_at = new Date().toISOString();
  if (providerId) patch.provider_id = String(providerId).slice(0, 200);
  if (errText) patch.error = String(errText).slice(0, 900);
  if (attempt !== undefined) patch.attempts = Number(attempt) || 0;
  // Dipakai untuk menunda kirim (mis. ke 10.00 WIB besok).
  if (sendAt) patch.send_at = sendAt;

  const { error } = await db.from(OUTBOX).update(patch).eq('id', id);
  if (error) throw new Error('Gagal memperbarui antrean: ' + error.message);
  return true;
}

/** Jumlah baris antrean per status (untuk dashboard). */
async function outboxSummary() {
  const db = requireDb();
  const statuses = ['queued', 'sent', 'failed', 'skipped'];
  const summary = {};

  await Promise.all(statuses.map(async (status) => {
    const { count } = await db
      .from(OUTBOX)
      .select('id', { count: 'exact', head: true })
      .eq('status', status);
    summary[status] = count || 0;
  }));

  return summary;
}

/** Riwayat antrean terbaru (tab Follow-up di /admin). */
async function listOutbox({ status = '', limit = 60 } = {}) {
  const db = requireDb();

  let query = db
    .from(OUTBOX)
    .select(
      'id, wa_number, nama, kind, template_key, campaign_id, message, ' +
      'send_at, status, attempts, provider_id, error, sent_at, created_at'
    );

  if (status) query = query.eq('status', status);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(300, Number(limit) || 60)));

  if (error) throw new Error('Gagal mengambil riwayat antrean: ' + error.message);
  return data || [];
}

/** Jalankan ulang baris antrean yang gagal (dipakai dari /admin). */
async function requeueOutbox(ids = []) {
  const db = requireDb();
  const list = (ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (!list.length) return 0;

  const { data, error } = await db
    .from(OUTBOX)
    .update({ status: 'queued', error: null, send_at: new Date().toISOString() })
    .in('id', list)
    .eq('status', 'failed')
    .select('id');

  if (error) throw new Error('Gagal mengulang antrean: ' + error.message);
  return (data || []).length;
}

/** Jumlah baris antrean untuk 1 campaign (untuk menandai campaign selesai). */
async function hitungAntreanCampaign(campaignId, status = 'queued') {
  const db = requireDb();
  const { count, error } = await db
    .from(OUTBOX)
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', status);

  if (error) throw new Error('Gagal menghitung antrean campaign: ' + error.message);
  return count || 0;
}

/**
 * Segarkan kolom `segmen` semua pelanggan (fungsi SQL hsf_refresh_segments).
 * @returns {Promise<number>} jumlah baris yang berubah
 */
async function segarkanSegmen() {
  const db = requireDb();
  const { data, error } = await db.rpc('hsf_refresh_segments');
  if (error) throw new Error('Gagal menyegarkan segmen: ' + error.message);
  return Number(data) || 0;
}

module.exports = {
  CUSTOMERS,
  OUTBOX,
  SEGMEN,
  segarkanSegmen,
  getStorageInfo,
  isSupabaseEnabled,
  normalizeWa,
  maskNumber,
  dateKeyWIB,
  monthKeyWIB,
  hourWIB,
  isoDaysAgo,
  listCustomers,
  getCustomerStats,
  setOptIn,
  selectTargets,
  getContactState,
  markContacted,
  enqueueOutbox,
  getDueOutbox,
  markOutboxResult,
  outboxSummary,
  listOutbox,
  requeueOutbox,
  hitungAntreanCampaign
};