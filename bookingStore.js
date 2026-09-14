// ============================================================
// HOME SPA FAMILY — Supabase data layer (lokal + Vercel)
// Jika SUPABASE_URL + KEY tersedia -> Postgres (persisten)
// Jika tidak -> fallback bookings.json lokal (mode lama)
// ============================================================

const fs = require('fs');
const path = require('path');

const bookingsFile = path.join(__dirname, 'bookings.json');

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
    supabaseError = 'SUPABASE_URL / KEY belum diisi, memakai file JSON lokal.';
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
  if (getSupabase()) return { storage: 'supabase' };
  return { storage: 'json-file', note: supabaseError || 'Supabase belum dikonfigurasi.' };
}

function ensureJsonFile() {
  if (!fs.existsSync(bookingsFile)) {
    fs.writeFileSync(bookingsFile, JSON.stringify([], null, 2));
  }
}

function loadJsonBookings() {
  try {
    ensureJsonFile();
    const data = fs.readFileSync(bookingsFile, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading bookings:', error);
    return [];
  }
}

function saveJsonBookings(bookings) {
  try {
    fs.writeFileSync(bookingsFile, JSON.stringify(bookings, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving bookings:', error);
    return false;
  }
}

function mapRowToBooking(row) {
  if (!row) return row;
  return {
    id: row.id,
    service: row.service,
    price: row.price,
    tanggal: row.tanggal,
    jam: row.jam,
    nama: row.nama,
    whatsapp: row.whatsapp,
    alamat: row.alamat,
    catatan: row.catatan || '',
    status: row.status || 'Menunggu Konfirmasi',
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
}

function mapBookingToRow(booking) {
  return {
    id: booking.id,
    service: booking.service,
    price: booking.price,
    tanggal: booking.tanggal,
    jam: booking.jam,
    nama: booking.nama,
    whatsapp: booking.whatsapp,
    alamat: booking.alamat,
    catatan: booking.catatan || '',
    status: booking.status || 'Menunggu Konfirmasi',
    created_at: booking.createdAt || new Date().toISOString(),
    updated_at: booking.updatedAt || null
  };
}
async function getAllBookings() {
  const client = getSupabase();
  if (!client) return loadJsonBookings().map(mapRowToBooking);
  const { data, error } = await client
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Supabase getAll: ' + error.message);
  return (data || []).map(mapRowToBooking);
}

async function getBookingById(id) {
  const client = getSupabase();
  if (!client) {
    return loadJsonBookings().map(mapRowToBooking).find((b) => b.id === id) || null;
  }
  const { data, error } = await client
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Supabase getById: ' + error.message);
  return data ? mapRowToBooking(data) : null;
}

async function createBooking(booking) {
  const client = getSupabase();
  if (!client) {
    const bookings = loadJsonBookings();
    bookings.push(booking);
    if (!saveJsonBookings(bookings)) throw new Error('Gagal menyimpan ke file JSON.');
    return booking;
  }
  const { data, error } = await client
    .from('bookings')
    .insert(mapBookingToRow(booking))
    .select()
    .single();
  if (error) throw new Error('Supabase insert: ' + error.message);
  return mapRowToBooking(data);
}

async function updateBookingStatus(id, status) {
  const client = getSupabase();
  if (!client) {
    const bookings = loadJsonBookings();
    const idx = bookings.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    bookings[idx].status = status;
    bookings[idx].updatedAt = new Date().toISOString();
    if (!saveJsonBookings(bookings)) throw new Error('Gagal menyimpan ke file JSON.');
    return mapRowToBooking(bookings[idx]);
  }
  const { data, error } = await client
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error('Supabase update: ' + error.message);
  return data ? mapRowToBooking(data) : null;
}

async function deleteBooking(id) {
  const client = getSupabase();
  if (!client) {
    const bookings = loadJsonBookings();
    const idx = bookings.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    const removed = bookings.splice(idx, 1)[0];
    if (!saveJsonBookings(bookings)) throw new Error('Gagal menyimpan ke file JSON.');
    return mapRowToBooking(removed);
  }
  const existing = await getBookingById(id);
  if (!existing) return null;
  const { error } = await client.from('bookings').delete().eq('id', id);
  if (error) throw new Error('Supabase delete: ' + error.message);
  return existing;
}

async function getStats() {
  const bookings = await getAllBookings();
  return {
    total: bookings.length,
    pending: bookings.filter((b) => b.status === 'Menunggu Konfirmasi').length,
    confirmed: bookings.filter((b) => b.status === 'Terkonfirmasi').length,
    completed: bookings.filter((b) => b.status === 'Selesai').length,
    cancelled: bookings.filter((b) => b.status === 'Dibatalkan').length,
    totalRevenue: bookings
      .filter((b) => b.status === 'Selesai')
      .reduce((sum, b) => sum + (Number(b.price) || 0), 0)
  };
}

function generateBookingId() {
  return 'BK' + Date.now() + Math.random().toString(36).slice(2, 9);
}

module.exports = {
  isSupabaseEnabled,
  getStorageInfo,
  getAllBookings,
  getBookingById,
  createBooking,
  updateBookingStatus,
  deleteBooking,
  getStats,
  generateBookingId
};
