// ============================================================
// Vercel Serverless: POST /api/wa-webhook
// HOME SPA FAMILY — Eva AI Auto-Reply WhatsApp (via Fonnte)
//
// Alur:
//   Pelanggan kirim WA -> Fonnte -> webhook ini -> Supabase
//   (riwayat) -> Gemini (Eva) -> Fonnte send -> pelanggan.
//
// Pengaturan di Fonnte Dashboard (Device -> Edit):
//   - Webhook URL : https://www.homespafamily.my.id/api/wa-webhook
//   - Auto read   : ON (wajib, tanpa ini webhook tidak jalan)
// ============================================================
const { generateEvaReply, FALLBACK_REPLY } = require('../eva');
const waStore = require('../waChatStore');
const waGroup = require('../waGroup');

const FONNTE_SEND_URL = 'https://api.fonnte.com/send';

// Jeda singkat untuk menggabungkan pesan yang dikirim beruntun
const BURST_WAIT_MS = 3000;
// Timeout per model Gemini (4 model x 4,8s + jeda + kirim < 25s maxDuration)
const GEMINI_TIMEOUT_MS = 4800;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function maskNumber(num) {
  const s = String(num || '');
  return s.length > 4 ? '****' + s.slice(-4) : '****';
}

/**
 * Kirim balasan via Fonnte Send API.
 * Header: Authorization: <device token> (tanpa "Bearer")
 * Body form: target, message, (opsional) inboxid utk reply dalam thread
 */
async function sendFonnte(target, message, inboxid) {
  const token = (process.env.FONNTE_TOKEN || '').trim();
  if (!token) return { ok: false, reason: 'FONNTE_TOKEN kosong' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const form = new URLSearchParams();
    form.set('target', target);
    form.set('message', message);
    if (inboxid) form.set('inboxid', String(inboxid));

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
    return { ok, reason: ok ? '' : (data.reason || `HTTP ${resp.status}`) };
  } catch (err) {
    return {
      ok: false,
      reason: err && err.name === 'AbortError' ? 'timeout' : ((err && err.message) || 'network error')
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  // GET = pengecekan URL webhook saat setup di dashboard Fonnte
  if (req.method === 'GET') {
    return res.status(200).json({ success: true, service: 'eva-wa-webhook' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Selalu balas 200 cepat agar Fonnte tidak mengulang webhook.
  // Balasan WA dikirim via Fonnte Send API, bukan lewat body response.
  const ack = () => res.status(200).json({});

  // ---- Parse payload (JSON; toleran juga kalau form/string) ----
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      try {
        body = Object.fromEntries(new URLSearchParams(body));
      } catch (_) {
        body = {};
      }
    }
  }
  body = body && typeof body === 'object' ? body : {};

  const sender = String(body.sender || '').trim();
  const device = String(body.device || '').trim();
  const member = String(body.member || '').trim();
  const name = String(body.name || '').trim();
  const inboxid = body.inboxid || null;

  let message = String(body.message || body.text || '').trim();
  const mediaUrl = String(body.url || body.media || '').trim();

  // ---- Guard dasar: abaikan hal-hal yang tidak perlu dibalas ----
  if (!sender || !/^\d{8,20}$/.test(sender)) return ack();
  if (member) return ack();                       // pesan grup -> abaikan
  if (device && sender === device) return ack();  // pesan sendiri/echo -> abaikan

  // ---- Media (foto bukti transfer, dll.) -> teruskan ke grup admin ----
  if (mediaUrl) {
    const caption = message.slice(0, 500);
    try {
      const g = await waGroup.forwardMedia({ sender, name, caption, url: mediaUrl });
      console.log(`[wa-webhook] media ${maskNumber(sender)} -> grup: ${g.ok ? 'OK' : g.reason}`);
    } catch (_) {}
    try {
      const reply = 'Terima kasih Kak! Foto sudah kami terima dan langsung diteruskan ' +
        'ke admin untuk diverifikasi 🙏 Mohon ditunggu ya.';
      await waStore.saveMessage(sender, 'customer', caption || '[foto/media]');
      await waStore.saveMessage(sender, 'eva', reply);
      await sendFonnte(sender, reply, inboxid);
    } catch (err) {
      console.error('[wa-webhook] media reply gagal:', err && err.message);
    }
    return ack();
  }

  if (!message && body.location) {
    message = 'Pelanggan mengirim titik lokasi (koordinat maps).';
  }
  if (!message) return ack();                     // stiker/gambar tanpa caption dll.

  message = message.slice(0, 4000);

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  try {
    // Cegah duplikat (webhook retry dari Fonnte)
    if (await waStore.isDuplicateRecent(sender, message, 15)) {
      console.log(`[wa-webhook] duplikat diabaikan chat ${maskNumber(sender)}`);
      return ack();
    }

    // Simpan pesan pelanggan
    const saved = await waStore.saveMessage(sender, 'customer', message);
    console.log(
      `[wa-webhook] chat ${maskNumber(sender)}${name ? ' (' + name.slice(0, 20) + ')' : ''} ` +
      `len=${message.length}`
    );

    // ---- Pesan booking dari form website -> template closing (tanpa AI) ----
    // Notifikasi ke grup sudah dikirim otomatis oleh POST /api/booking saat
    // booking disimpan, jadi di sini cukup balas konfirmasi + pembayaran.
    const booking = waGroup.parseBookingMessage(message);
    if (booking) {
      const closingReply = waGroup.buildBookingCustomerReply(booking);
      try {
        await waStore.saveMessage(sender, 'eva', closingReply);
      } catch (_) {}
      const sentBooking = await sendFonnte(sender, closingReply, inboxid);
      console.log(
        `[wa-webhook] booking ${maskNumber(sender)} -> closing: ${sentBooking.ok ? 'OK' : sentBooking.reason}`
      );
      return ack();
    }

    // Jeda singkat: kalau pelanggan mengirim pesan lagi dalam jeda ini,
    // serahkan jawaban ke invokasi terbaru (digabung, tidak menjawab 2x).
    await sleep(BURST_WAIT_MS);
    const latest = await waStore.getLatestCustomerMessage(sender);
    if (latest && latest.id && saved && saved.id && latest.id !== saved.id) {
      console.log(`[wa-webhook] pesan lama dilewati, versi terbaru yang dijawab (${maskNumber(sender)})`);
      return ack();
    }

    // Riwayat percakapan untuk konteks Eva (16 pesan terakhir)
    const recent = await waStore.getRecentMessages(sender, 16);
    const history = recent
      .filter(row => !saved || row.id !== saved.id)
      .map(row => ({
        role: row.sender_type === 'customer' ? 'user' : 'model',
        text: row.message
      }));

    // Tanya Eva (Gemini)
    const result = await generateEvaReply({
      apiKey,
      message,
      history,
      timeoutMs: GEMINI_TIMEOUT_MS
    });

    const reply = result.reply || FALLBACK_REPLY;
    if (!result.reply) {
      console.error('[wa-webhook] Gemini gagal:', result.error);
    }

    // Simpan balasan Eva ke riwayat
    try {
      await waStore.saveMessage(sender, 'eva', reply);
    } catch (err) {
      console.error('[wa-webhook] gagal simpan balasan:', err && err.message);
    }

    // Kirim balasan ke pelanggan via Fonnte
    const sent = await sendFonnte(sender, reply, inboxid);
    if (!sent.ok) {
      console.error(`[wa-webhook] Fonnte send gagal: ${sent.reason}`);
    }

    return ack();
  } catch (err) {
    console.error('[wa-webhook] error:', err && err.message);

    // Fallback: jangan biarkan pelanggan tanpa jawaban
    try {
      await sendFonnte(sender, FALLBACK_REPLY, inboxid);
    } catch (_) {}

    return ack();
  }
};