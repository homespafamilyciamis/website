// ============================================================
// HOME SPA FAMILY — Supabase data layer untuk riwayat chat WA
// Tabel: public.wa_messages (chat_id, sender_type, message)
// Dipakai oleh api/wa-webhook.js (Santi AI auto-reply Fonnte)
// ============================================================

const TABLE = 'wa_messages';

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
  if (getSupabase()) return { storage: 'supabase', table: TABLE };
  return { storage: 'unavailable', note: supabaseError || 'Supabase belum dikonfigurasi.' };
}

/**
 * Simpan 1 pesan chat. @returns {Promise<{id:number}>}
 */
async function saveMessage(chatId, senderType, message) {
  const db = getSupabase();
  if (!db) throw new Error('Supabase belum dikonfigurasi: ' + supabaseError);

  const { data, error } = await db
    .from(TABLE)
    .insert({ chat_id: chatId, sender_type: senderType, message })
    .select('id')
    .single();

  if (error) throw new Error('Gagal simpan pesan WA: ' + error.message);
  return data;
}

/**
 * Ambil N pesan terakhir satu chat, urut lama -> baru.
 */
async function getRecentMessages(chatId, limit = 16) {
  const db = getSupabase();
  if (!db) return [];

  const { data, error } = await db
    .from(TABLE)
    .select('id, sender_type, message, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getRecentMessages error:', error.message);
    return [];
  }
  return (data || []).reverse();
}

/**
 * Pesan terakhir dari pelanggan pada chat ini.
 */
async function getLatestCustomerMessage(chatId) {
  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from(TABLE)
    .select('id, message, created_at')
    .eq('chat_id', chatId)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('getLatestCustomerMessage error:', error.message);
    return null;
  }
  return data && data[0] ? data[0] : null;
}

/**
 * Deteksi duplikat: pesan identik dari chat yang sama dalam N detik terakhir.
 * Dipakai untuk mencegah balasan ganda saat Fonnte mengulang webhook.
 */
async function isDuplicateRecent(chatId, message, withinSeconds = 15) {
  const db = getSupabase();
  if (!db) return false;

  const since = new Date(Date.now() - withinSeconds * 1000).toISOString();
  const { data, error } = await db
    .from(TABLE)
    .select('id')
    .eq('chat_id', chatId)
    .eq('sender_type', 'customer')
    .eq('message', message)
    .gte('created_at', since)
    .limit(1);

  if (error) {
    console.error('isDuplicateRecent error:', error.message);
    return false;
  }
  return Boolean(data && data.length);
}

module.exports = {
  getStorageInfo,
  isSupabaseEnabled,
  saveMessage,
  getRecentMessages,
  getLatestCustomerMessage,
  isDuplicateRecent
};