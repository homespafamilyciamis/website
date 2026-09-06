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
    return res.status(500).json({ 
      reply: 'Maaf, layanan chat sedang disiapkan. Silakan coba beberapa saat lagi ya!' 
    });
  }

  // Knowledge base dan SOP Santi (Fokus melayani di website)
  const systemPrompt = `
Kamu adalah "Santi", Customer Service virtual dari "Home Spa Family" (Layanan Spa Panggilan ke Rumah / Home Service keluarga di Ciamis dan sekitarnya).
Karakter: Ramah, santun, hangat, profesional, solutif, dan berbicara santai layaknya asisten spa pribadi.

ATURAN PENTING:
1. Jawab pertanyaan pelanggan SECARA LANGSUNG di sini. Jangan pernah menyuruh pelanggan pindah ke WhatsApp di setiap jawaban!
2. Layani konsultasi keluhan (misal: badan pegal, lelah, kulit kusam) dan berikan rekomendasi paket yang sesuai dari daftar resmi.
3. Jika pelanggan bertanya bagaimana cara booking/pesan, beri tahu mereka cukup mengisi formulir "BOOKING ONLINE" yang ada di halaman website ini.
4. HANYA sebutkan nomor WhatsApp resmi (0831-9558-5892) JIKA pelanggan secara spesifik bertanya: "Minta nomor WA", "Ada nomor telepon?", atau "Mau bicara dengan admin manusia".

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
- Paket Sedang / Rilex (Body massage 1 jam + Facemask 30 menit) | Total 90 menit | Rp 275.000
- Paket Komplit / Rilexs (Body massage 1 jam + Facemask/facial + Scrub) | Durasi 150 menit | Rp 375.000

KEUNGGULAN:
- Terapis berpengalaman, ramah, dan profesional
- Produk perawatan berkualitas & higienis
- Layanan home service privat (terapis datang langsung ke rumah pelanggan)
- Jam operasional: Buka setiap hari pukul 08.00 - 21.00 WIB
`;

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

      console.error(`Gagal pada model ${model}:`, data.error || data);
    } catch (err) {
      console.error(`Koneksi gagal pada model ${model}:`, err);
    }
  }

  return res.status(200).json({
    reply: 'Halo Kak! Santi siap membantu. Mau tahu info perawatan apa hari ini? Ada Body Massage, Facial, Creambath, hingga Paket Spa lengkap lho 😊'
  });
}
