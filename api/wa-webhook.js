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

// ============================================================
// Perintah admin lewat grup WhatsApp
//   SETUJU <id> / TOLAK <id>   -> setujui/batalkan campaign broadcast
//   !laporan                   -> ringkasan laporan analisis AI terakhir
//   !status                    -> ringkasan antrean & aturan otomasi
//   !pause / !aktif            -> matikan/nyalakan semua aturan otomasi
// Hanya diproses bila pesan datang dari WA_GROUP_ID (grup admin).
// ============================================================
function bacaPerintahAdmin(teks) {
  const upper = String(teks || '').trim().toUpperCase();

  let cocok = upper.match(/^(?:SETUJU|APPROVE|OK)\s+(\d+)$/);
  if (cocok) return { aksi: 'setujui', arg: cocok[1] };

  cocok = upper.match(/^(?:TOLAK|BATAL|CANCEL)\s+(\d+)$/);
  if (cocok) return { aksi: 'tolak', arg: cocok[1] };

  if (/^(?:!|#)(?:LAPORAN|REPORT|ANALISIS)$/.test(upper)) return { aksi: 'laporan', arg: '' };
  if (/^(?:!|#)(?:STATUS|CEK)$/.test(upper)) return { aksi: 'status', arg: '' };
  if (/^(?:!|#)(?:PAUSE|MATIKAN|STOP OTOMASI)$/.test(upper)) return { aksi: 'matikan', arg: '' };
  if (/^(?:!|#)(?:AKTIF|NYALAKAN|ON OTOMASI)$/.test(upper)) return { aksi: 'nyalakan', arg: '' };

  return null;
}

/** Deteksi permintaan berhenti dihubungi dari pelanggan (jadi opt-out). */
function adalahPermintaanBerhenti(teks) {
  const t = String(teks || '').trim().toLowerCase();
  if (!t) return false;
  if (/^(stop|berhenti|unsubscribe|unsub)\b/.test(t) && t.length <= 40) return true;
  if (/(jangan|tolong jangan|gausah|gak usah|tidak usah)\s+(kirim|chat|hubungi|spam|wa|whatsapp)/i.test(t)) {
    return true;
  }
  return /hapus nomor/i.test(t);
}

/**
 * Jalankan perintah admin dari grup WhatsApp.
 * Semua operasi di sini cepat (database + 1 balasan), sehingga aman
 * di dalam batas waktu fungsi webhook (25 detik).
 */
async function jalankanPerintahAdmin(perintah, pengirim) {
  const automationStore = require('../automationStore');
  const customerStore = require('../customerStore');
  const waFollowup = require('../waFollowup');

  const namaAdmin = String(pengirim || 'admin').slice(0, 60);
  const balas = async (teks) => {
    try {
      await waGroup.sendToGroup(teks);
    } catch (err) {
      console.error('[wa-webhook] gagal membalas grup:', err && err.message);
    }
  };

  if (perintah.aksi === 'setujui' || perintah.aksi === 'tolak') {
    const id = Number(perintah.arg);
    const campaign = await automationStore.getBroadcast(id);
    if (!campaign) {
      await balas('❌ Campaign #' + id + ' tidak ditemukan.');
      return;
    }

    if (perintah.aksi === 'tolak') {
      await automationStore.updateBroadcast(id, { status: 'dibatalkan' });
      await balas('🚫 Campaign #' + id + ' (*' + campaign.nama + '*) dibatalkan oleh ' + namaAdmin + '.');
      return;
    }

    if (['menunggu_approval', 'draft'].indexOf(campaign.status) === -1) {
      await balas('ℹ️ Campaign #' + id + ' sudah berstatus "' + campaign.status + '".');
      return;
    }

    const disetujui = await automationStore.updateBroadcast(id, {
      status: 'disetujui',
      approved_by: namaAdmin,
      approved_at: new Date().toISOString()
    });

    const susun = await waFollowup.susunBroadcastCampaign(disetujui);
    await customerStore.enqueueOutbox(susun.items);
    await automationStore.updateBroadcast(id, { total_target: susun.items.length });

    await balas(
      '✅ Campaign #' + id + ' (*' + campaign.nama + '*) disetujui oleh ' + namaAdmin + '.\n' +
      'Target: ' + susun.items.length + ' pelanggan (hanya yang bersedia dihubungi).\n' +
      'Dikirim otomatis pada 10.00 WIB berikutnya, atau tekan "Kirim" di dashboard admin.'
    );
    return;
  }

  if (perintah.aksi === 'laporan') {
    const laporan = await automationStore.getLatestReport();
    if (!laporan) {
      await balas('Belum ada laporan analisis. Buka dashboard admin → tab Laporan AI → "Buat laporan sekarang".');
      return;
    }
    // eslint-disable-next-line global-require
    await balas(require('../analyst').teksLaporanWhatsApp(laporan));
    return;
  }

  if (perintah.aksi === 'status') {
    const [antrean, rules] = await Promise.all([
      customerStore.outboxSummary(),
      automationStore.getRules()
    ]);
    const aktif = rules.filter((r) => r.is_on).map((r) => r.key).join(', ') || 'tidak ada';

    await balas(
      '📦 *Status Otomasi Eva*\n' +
      '• Antrean menunggu: ' + (antrean.queued || 0) + '\n' +
      '• Total terkirim: ' + (antrean.sent || 0) + '\n' +
      '• Gagal: ' + (antrean.failed || 0) + '\n' +
      '• Aturan aktif: ' + aktif
    );
    return;
  }

  if (perintah.aksi === 'matikan' || perintah.aksi === 'nyalakan') {
    const nyalakan = perintah.aksi === 'nyalakan';
    const rules = await automationStore.getRules();

    for (const rule of rules) {
      if (rule.is_on === nyalakan) continue;
      await automationStore.updateRule(rule.key, { is_on: nyalakan });
    }

    await balas(nyalakan
      ? '▶️ Semua otomasi Eva DIAKTIFKAN oleh ' + namaAdmin + '.'
      : '⏸️ Semua otomasi Eva DIMATIKAN oleh ' + namaAdmin + ' (chat pelanggan tetap dibalas).');
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

  // ---- Perintah admin dari grup (diproses sebelum filter nomor) ----
  const grupAdmin = (process.env.WA_GROUP_ID || '').trim();
  const dariGrupAdmin = Boolean(grupAdmin) && sender === grupAdmin;
  const perintah = bacaPerintahAdmin(message);

  if (perintah) {
    if (!dariGrupAdmin) return ack();   // perintah hanya sah dari grup admin
    try {
      await jalankanPerintahAdmin(perintah, member || name || 'admin');
    } catch (err) {
      console.error('[wa-webhook] perintah admin gagal:', err && err.message);
    }
    return ack();
  }

  // ---- Guard dasar: abaikan hal-hal yang tidak perlu dibalas ----
  if (!sender || !/^\d{8,20}$/.test(sender)) return ack();
  if (member) return ack();                       // pesan grup -> abaikan
  if (device && sender === device) return ack();  // pesan sendiri/echo -> abaikan

  // ---- Pelanggan minta berhenti dihubungi -> matikan otomasi untuk nomor ini ----
  if (adalahPermintaanBerhenti(message)) {
    const customerStore = require('../customerStore');
    try {
      await customerStore.setOptIn(sender, false, 'Permintaan berhenti: ' + message.slice(0, 200));
    } catch (err) {
      console.error('[wa-webhook] gagal menyimpan opt-out:', err && err.message);
    }
    try {
      const balas = 'Baik Kak, mohon maaf atas ketidaknyamanannya 🙏 Nomor Kakak sudah kami ' +
        'keluarkan dari daftar promosi. Untuk booking atau pertanyaan layanan, Kakak tetap ' +
        'bisa chat di nomor ini ya.';
      await waStore.saveMessage(sender, 'customer', message);
      await waStore.saveMessage(sender, 'eva', balas);
      await sendFonnte(sender, balas, inboxid);
    } catch (err) {
      console.error('[wa-webhook] balasan opt-out gagal:', err && err.message);
    }
    return ack();
  }

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

    // Simpan pesan pelanggan — kegagalan simpan (mis. RLS/belum service_role)
    // TIDAK boleh mematikan balasan Eva.
    let saved = null;
    try {
      saved = await waStore.saveMessage(sender, 'customer', message);
    } catch (err) {
      console.error('[wa-webhook] gagal simpan pesan (balasan tetap jalan):', err && err.message);
    }
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