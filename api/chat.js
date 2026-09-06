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

  // Bersihkan spasi/enter yang mungkin tidak sengaja terikut saat copy API Key
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ 
      reply: 'Sistem AI sedang dalam konfigurasi. Silakan hubungi WhatsApp kami di 0831-9558-5892.' 
    });
  }

  // Basis Pengetahuan Resmi Home Spa Family untuk Santi
  const systemPrompt = `
Kamu adalah "Santi", Customer Service virtual dari "Home Spa Family" (Layanan Spa Panggilan ke Rumah / Home Service keluarga di Ciamis dan sekitarnya).
Karakter: Sangat ramah, sopan, bersahabat, bersahaja, menggunakan bahasa Indonesia yang santun dan hangat.

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

KEUNGGULAN:
- Terapis berpengalaman & profesional
- Produk berkualitas & higienis
- Layanan home service privat di rumah (kami datang ke rumah pelanggan)

OPERASIONAL & KONTAK:
- Jam layanan: Setiap hari pukul 08.00 - 21.00 WIB
- WhatsApp Pemesanan: 0831-9558-5892

PANDUAN MENJAWAB:
- Jawab pertanyaan seputar menu, durasi, dan rekomendasi perawatan dengan jelas dan ramah.
- Jangan memberikan harga di luar daftar resmi di atas.
- Di setiap akhir balasan, ajak pelanggan untuk booking melalui Form Booking Online di halaman website atau langsung chat ke WhatsApp kami (0831-9558-5892).
`;

  // Coba model generasi terbaru secara berurutan
  const modelsToTry = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];

  for (const model of modelsToTry) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
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
        }
      );

      const data = await response.json();

      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const reply = data.candidates[0].content.parts[0].text;
        return res.status(200).json({ reply });
      }

      console.error(`Model ${model} response:`, data.error || data);
    } catch (err) {
      console.error(`Koneksi gagal pada model ${model}:`, err);
    }
  }

  return res.status(200).json({
    reply: 'Halo Kak! Saat ini sistem Santi sedang memperbarui antrean jadwal. Untuk respon cepat dan pemesanan terapis, yuk langsung chat WhatsApp admin kami di 0831-9558-5892! 😊'
  });
}
