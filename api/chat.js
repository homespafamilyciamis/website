export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let message = req.body?.message;
  if (!message && typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      message = parsed.message;
    } catch (e) {}
  }

  if (!message) {
    return res.status(400).json({ error: 'Pesan tidak boleh kosong' });
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(200).json({ 
      reply: 'Kunci API belum terbaca di Vercel. Pastikan GEMINI_API_KEY sudah disave di menu Environment Variables Vercel.' 
    });
  }

  // Pengetahuan & Karakter Santi
  const systemPrompt = `
Kamu adalah "Santi", Customer Service virtual resmi dari "Home Spa Family" (Layanan Spa Panggilan ke Rumah / Home Service di Ciamis dan sekitarnya).
Karakter: Ramah, santun, hangat, profesional, dan solutif layaknya asisten spa pribadi keluarga.

ATURAN UTAMA:
1. Jawab pertanyaan pelanggan SECARA LANGSUNG, NYAMBUNG, dan SPESIFIK sesuai apa yang ditanyakan!
2. Jika ditanya "apakah bisa untuk laki-laki / pria?": Jawab BISA. Home Spa Family adalah spa keluarga yang melayani pria, wanita, anak-anak, ibu hamil, maupun reservasi untuk pasangan/keluarga di rumah.
3. Berikan informasi treatment, durasi, dan harga sesuai daftar resmi di bawah ini.
4. Jika pelanggan ingin memesan / booking, arahkan untuk mengisi formulir "BOOKING ONLINE" yang ada di atas halaman website ini.
5. JANGAN menyuruh pelanggan pindah ke WhatsApp di setiap jawaban, kecuali jika pelanggan secara khusus meminta nomor telepon/kontak admin.

PRICELIST & LAYANAN RESMI:
1. DAFTAR LAYANAN SATUAN:
- Body massage: Rp 120.000
- Pijat ibu hamil: Rp 200.000 / jam
- Facial: Rp 100.000
- Face massage + masker: Rp 100.000
- Facial + masker: Rp 150.000
- Creambath: Rp 100.000
- Masker rambut: Rp 85.000
- Scrub: Rp 100.000
- Kerokan: Rp 30.000
- Cuci catok: Rp 30.000
- Gurah mata: Rp 150.000
- Bekam: Rp 300.000

2. PAKET SPA:
- Paket Manja (Scrub + facial + masker) | Durasi 1,5 jam | Rp 230.000
- Paket Rilex (Body massage + facemask) | Durasi 1,5 jam | Rp 210.000
- Paket Komplit (Body massage + facial + masker + scrub) | Durasi 2,5 jam | Rp 350.000

3. DAFTAR PANGGILAN:
- Body Massage (1 jam treatment) | Durasi 70 menit | Rp 175.000
- Paket Rilex / Sedang (Body massage 1 jam + Facemask 30 menit) | Total 90 menit | Rp 275.000
- Paket Komplit / Rilexs (Body massage 1 jam + Facemask/facial + Scrub) | Durasi 150 menit | Rp 375.000

OPERASIONAL:
- Jam layanan: Setiap hari pukul 08.00 - 21.00 WIB
- WhatsApp Admin: 0831-9558-5892 (hanya sebutkan jika ditanya nomor kontak)
`;

  // Model Gemini aktif
  const models = ['gemini-1.5-flash', 'gemini-2.5-flash'];
  let lastError = '';

  for (const model of models) {
    try {
      // Kirim kunci API HANYA lewat parameter URL (?key=) untuk menghindari konflik kredensial ganda
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: message }]
            }
          ]
        })
      });

      const data = await response.json();

      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return res.status(200).json({ reply: data.candidates[0].content.parts[0].text });
      }

      lastError = data.error?.message || JSON.stringify(data);
    } catch (err) {
      lastError = err.message;
    }
  }

  // Jika Google memberikan penolakan tertentu, tampilkan penyebab aslinya agar langsung terdeteksi
  return res.status(200).json({
    reply: `Maaf Kak, sistem AI mengalami kendala teknis: ${lastError}`
  });
}
