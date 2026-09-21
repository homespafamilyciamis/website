// ============================================================
// HOME SPA FAMILY — Helper bersama untuk memanggil Gemini
// Dipakai oleh:
//   - eva.js      : balasan CS "Eva" ke pelanggan WhatsApp
//   - analyst.js  : analisis bisnis + opsi aksi untuk admin
//
// Menggunakan daftar model fallback yang sama dengan api/chat.js
// (model pertama gagal/tidak tersedia -> otomatis coba berikutnya).
// ============================================================

const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash'
];

/**
 * Panggil Gemini sampai ada model yang berhasil.
 * @returns {Promise<{text:string, model:string, error:string}>}
 */
async function generateText({
  apiKey,
  systemPrompt,
  contents,
  timeoutMs = 8000,
  maxOutputTokens = 700,
  models = GEMINI_MODELS,
  responseMimeType = '',
  thinkingLevel = 'low'
}) {
  if (!apiKey) {
    return { text: '', model: '', error: 'GEMINI_API_KEY belum diisi' };
  }
  if (!Array.isArray(contents) || !contents.length) {
    return { text: '', model: '', error: 'Konten permintaan kosong' };
  }

  let lastError = '';

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const generationConfig = {
        maxOutputTokens,
        thinkingConfig: { thinkingLevel }
      };
      if (responseMimeType) generationConfig.responseMimeType = responseMimeType;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig
          }),
          signal: controller.signal
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const text = (data?.candidates?.[0]?.content?.parts || [])
          .map((part) => part.text || '')
          .join('')
          .trim();
        if (text) return { text, model, error: '' };
      }

      lastError = data?.error?.message || `Gemini API error (${response.status})`;
    } catch (err) {
      lastError =
        err && err.name === 'AbortError'
          ? 'Timeout layanan AI'
          : ((err && err.message) || 'Koneksi ke layanan AI gagal');
    } finally {
      clearTimeout(timer);
    }
  }

  return { text: '', model: '', error: lastError };
}

/** Ambil objek JSON dari balasan model (toleran terhadap code fence). */
function parseJsonReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) candidates.push(fenced[1].trim());

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {
      // coba kandidat berikutnya
    }
  }
  return null;
}

module.exports = {
  GEMINI_MODELS,
  generateText,
  parseJsonReply
};