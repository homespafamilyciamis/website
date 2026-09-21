// ============================================================
// HOME SPA FAMILY — Pemeriksaan akses untuk endpoint admin & cron
// Dipakai oleh api/customers.js, api/broadcast.js, api/automation.js,
// api/analytics.js, api/cron/daily.js, api/cron/weekly.js
// ============================================================

function ambilKeyAdmin(req) {
  const dariHeader = (req.headers && req.headers['x-admin-key']) || '';
  const dariQuery = (req.query && req.query.adminKey) || '';
  let dariBody = '';

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    dariBody = req.body.adminKey || '';
  }

  return String(dariHeader || dariQuery || dariBody || '');
}

/** true = boleh lanjut. Aman walau ADMIN_KEY belum diatur (mode lama). */
function cekAdmin(req) {
  const configured = (process.env.ADMIN_KEY || '').trim();
  if (!configured) return true;
  return ambilKeyAdmin(req) === configured;
}

/**
 * Verifikasi pemanggil cron — FAIL-CLOSED.
 * Vercel otomatis mengirim header "Authorization: Bearer <CRON_SECRET>".
 * Untuk uji manual, boleh lewat ?secret= atau header x-cron-secret.
 *
 * Jika CRON_SECRET belum diatur di server, SEMUA panggilan cron DITOLAK.
 * Ini mencegah orang lain memicu broadcast/follow-up lewat URL
 * sebelum kunci dipasang (cron = pengirim pesan nyata ke pelanggan).
 */
function cekCron(req) {
  const configured = (process.env.CRON_SECRET || '').trim();
  if (!configured) return false;

  const header = String((req.headers && req.headers.authorization) || '');
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const query = String((req.query && (req.query.secret || req.query.cronSecret)) || '');
  const manual = String((req.headers && req.headers['x-cron-secret']) || '');

  return bearer === configured || query === configured || manual === configured;
}

/** Baca body JSON dengan aman (Vercel bisa mengirim string atau objek). */
function bodyJson(req) {
  const body = req.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (_) {
      try {
        return Object.fromEntries(new URLSearchParams(body));
      } catch (_) {
        return {};
      }
    }
  }
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  return {};
}

module.exports = {
  ambilKeyAdmin,
  cekAdmin,
  cekCron,
  bodyJson
};