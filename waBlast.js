// ============================================================
// HOME SPA FAMILY — Pengiriman WhatsApp (tunggal & massal) via Fonnte
//
// Kunci hemat waktu: Fonnte menerima BANYAK nomor dalam 1 request
// (`target` dipisah koma) dan mengantre + memberi jeda acak sendiri
// (`delay`), sehingga fungsi Vercel (maks 25-60 detik) tidak perlu
// menunggu pengiriman satu per satu.
//
// Env:
//   FONNTE_TOKEN            token CS (dipakai juga untuk broadcast bila
//                           FONNTE_TOKEN_BROADCAST tidak diisi)
//   FONNTE_TOKEN_BROADCAST  token device khusus broadcast (disarankan)
//   FONNTE_JEDA             jeda acak antar nomor, contoh "8-20" (detik)
//   FONNTE_MAX_TARGET       maksimal nomor per request (bawaan 25)
// ============================================================

const FONNTE_SEND_URL = 'https://api.fonnte.com/send';

const MAX_TARGET = Math.max(1, Math.min(50, Number(process.env.FONNTE_MAX_TARGET) || 25));

function tokenBroadcast() {
  return (process.env.FONNTE_TOKEN_BROADCAST || process.env.FONNTE_TOKEN || '').trim();
}

function tokenCs() {
  return (process.env.FONNTE_TOKEN || '').trim();
}

/** Bersihkan nilai variabel target (tidak boleh ada "|" atau baris baru). */
function bersihkanVariabel(teks) {
  return String(teks || '').replace(/[|\r\n]/g, ' ').trim().slice(0, 60);
}

/** Ambil nama panggilan saja, mis. "Budi Santoso" -> "Budi". */
function namaPanggilan(name) {
  const bersih = bersihkanVariabel(name);
  if (!bersih) return 'Kak';
  return bersih.split(/\s+/)[0].slice(0, 30);
}

function punyaPlaceholderName(message) {
  return /\{name\}/i.test(String(message || ''));
}

function renderName(message, name) {
  return String(message || '').replace(/\{name\}/gi, namaPanggilan(name));
}

/** Kirim 1 permintaan ke Fonnte Send API. */
async function kirimPermintaan({ token, form, timeoutMs = 12000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(FONNTE_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString(),
      signal: controller.signal
    });

    const data = await resp.json().catch(() => ({}));
    const ok = resp.ok && data.status === true;

    return {
      ok,
      reason: ok ? '' : (data.reason || ('HTTP ' + resp.status)),
      detail: data.detail || '',
      ids: Array.isArray(data.id) ? data.id.map(String) : []
    };
  } catch (err) {
    return {
      ok: false,
      reason: err && err.name === 'AbortError' ? 'timeout' : ((err && err.message) || 'network error'),
      detail: '',
      ids: []
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Kirim satu pesan (mis. pemberitahuan internal / balasan manual). */
async function sendSingle({ to, message, token, inboxid } = {}) {
  const pakaiToken = (token || tokenBroadcast()).trim();
  if (!pakaiToken) return { ok: false, reason: 'FONNTE_TOKEN kosong' };
  if (!to || !message) return { ok: false, reason: 'target/pesan kosong' };

  const form = new URLSearchParams();
  form.set('target', String(to));
  form.set('message', String(message));
  if (inboxid) form.set('inboxid', String(inboxid));

  return kirimPermintaan({ token: pakaiToken, form });
}

/**
 * Kirim sekumpulan pesan secara efisien.
 *
 * @param {Array} items [{ wa_number, message, nama, vars:{name} }]
 * @param {object} options
 *   token         token device (bawaan: tokenBroadcast())
 *   jeda          "8-20" = jeda acak antar nomor (bawaan FONNTE_JEDA)
 *   staggerDetik  jeda antar kelompok pengiriman (bawaan 60 detik)
 *   mulaiPada     Date kapan batch mulai (bawaan: sekarang)
 *   dryRun        true = hanya menyusun payload, tidak mengirim
 */
async function sendBatch(items = [], options = {}) {
  const token = (options.token || tokenBroadcast()).trim();
  const jeda = String(options.jeda || process.env.FONNTE_JEDA || '8-20');
  const staggerDetik = Number(options.staggerDetik === undefined ? 60 : options.staggerDetik) || 0;
  const mulaiPada = options.mulaiPada instanceof Date ? options.mulaiPada.getTime() : Date.now();
  const dryRun = Boolean(options.dryRun);

  const daftar = (items || []).filter((item) => item && item.wa_number && item.message);
  if (!daftar.length) {
    return { ok: true, total: 0, terpecah: 0, errors: [], groups: [], dryRun };
  }
  if (!token && !dryRun) {
    return { ok: false, total: daftar.length, terpecah: 0, errors: ['FONNTE_TOKEN kosong'], groups: [], dryRun };
  }

  // Pesan dengan teks identik dikelompokkan -> 1 panggilan API saja.
  const peta = new Map();
  daftar.forEach((item) => {
    const kunci = String(item.message).trim();
    if (!peta.has(kunci)) peta.set(kunci, []);
    peta.get(kunci).push(item);
  });

  const groups = Array.from(peta.entries()).map(([message, list]) => ({ message, list }));
  const hasil = [];
  let nomorBatch = 0;

  for (const group of groups) {
    for (let i = 0; i < group.list.length; i += MAX_TARGET) {
      const potongan = group.list.slice(i, i + MAX_TARGET);
      const pakaiVariabel = potongan.length > 1 && punyaPlaceholderName(group.message);

      const target = pakaiVariabel
        ? potongan
          .map((it) => it.wa_number + '|' + namaPanggilan((it.vars && it.vars.name) || it.nama))
          .join(',')
        : potongan[0].wa_number;

      const pesan = pakaiVariabel
        ? group.message
        : renderName(group.message, (potongan[0].vars && potongan[0].vars.name) || potongan[0].nama);

      const form = new URLSearchParams();
      form.set('target', target);
      form.set('message', pesan);
      if (potongan.length > 1) form.set('delay', jeda);
      if (nomorBatch > 0 && staggerDetik > 0) {
        form.set('schedule', String(Math.floor((mulaiPada + nomorBatch * staggerDetik * 1000) / 1000)));
      }

      if (dryRun) {
        hasil.push({
          ok: true,
          dryRun: true,
          jumlah: potongan.length,
          target,
          pesan,
          wa_numbers: potongan.map((it) => it.wa_number)
        });
        nomorBatch += 1;
        continue;
      }

      const resp = await kirimPermintaan({ token, form });
      hasil.push({
        ok: resp.ok,
        reason: resp.reason,
        detail: resp.detail,
        jumlah: potongan.length,
        ids: resp.ids,
        wa_numbers: potongan.map((it) => it.wa_number)
      });
      nomorBatch += 1;
    }
  }

  const gagal = hasil.filter((h) => !h.ok);
  return {
    ok: gagal.length === 0,
    total: daftar.length,
    terpecah: hasil.length,
    errors: gagal.map((g) => g.reason).filter(Boolean),
    groups: hasil,
    dryRun
  };
}

/** Jam kirim aman: 08.00-20.00 WIB (menghindari malam). */
function jamKirimAman(sekarang = new Date()) {
  const jam = parseInt(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false
    }).format(sekarang),
    10
  );
  const mulai = Number(process.env.WA_JAM_MULAI || 8);
  const selesai = Number(process.env.WA_JAM_SELESAI || 20);
  return jam >= mulai && jam < selesai;
}

let cacheDikecualikan = null;

/** Nomor yang tidak boleh dihubungi otomasi (grup admin & nomor admin). */
function nomorDikecualikan() {
  if (cacheDikecualikan) return cacheDikecualikan;

  const daftar = new Set();

  const grup = (process.env.WA_GROUP_ID || '').trim();
  if (grup) daftar.add(grup.replace(/\D/g, ''));

  const admin = (process.env.WHATSAPP_NUMBER || '').trim();
  if (admin) daftar.add(admin.replace(/\D/g, ''));

  (process.env.WA_NOMOR_DIKECUALIKAN || '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean)
    .forEach((n) => daftar.add(n));

  cacheDikecualikan = daftar;
  return daftar;
}

function apakahDikecualikan(waNumber) {
  const bersih = String(waNumber || '').replace(/\D/g, '');
  if (!bersih) return true;
  return nomorDikecualikan().has(bersih);
}

module.exports = {
  FONNTE_SEND_URL,
  MAX_TARGET,
  tokenBroadcast,
  tokenCs,
  namaPanggilan,
  renderName,
  punyaPlaceholderName,
  sendSingle,
  sendBatch,
  jamKirimAman,
  nomorDikecualikan,
  apakahDikecualikan
};