export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Pesan tidak boleh kosong' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ reply: 'Sistem AI sedang dalam konfigurasi. Silakan hubungi WhatsApp kami di 0831-9558-5892.' });
  }

  // Knowledge base spa untuk Santi
  const systemPrompt = `
Kamu adalah "Santi", Customer Service virtual dari "Home Spa Family" (Layanan Spa Panggilan ke Rumah / Home Service di Ciamis dan sekitarnya).
Karakter: Sangat ramah, sopan, bersahabat, menggunakan bahasa Indonesia yang santun dan hangat.

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
- Paket Sedang (Body massage 1 jam + Facemask 30 menit) | Total 90 menit | Rp 275.000
- Paket Rilexs (Body massage 1 jam + Facemask/facial + Scrub) | Durasi 150 menit | Rp 375.000

KEUNGGULAN:
- Terapis berpengalaman & bersertifikat
- Produk berkualitas, aman untuk kulit
- Higienis, peralatan bersih
- Home service fleksibel: terapis datang langsung ke rumah pelanggan.

OPERASIONAL & KONTAK:
- Jam layanan: Setiap hari pukul 08.00 - 21.00 WIB.
- WhatsApp Resmi: 0831-9558-5892.

ATURAN MENJAWAB:
- Jawab pertanyaan seputar harga, paket, dan perawatan secara ringkas, jelas, dan ramah.
- Jangan mengarang layanan di luar daftar di atas.
- Di akhir jawaban, ajak pelanggan melakukan booking melalui "Form Booking Online" di bagian atas halaman atau langsung klik link WhatsApp admin (0831-9558-5892).
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
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
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 
      'Maaf, Santi sedang kesulitan memproses pesan. Silakan hubungi WhatsApp kami di 0831-9558-5892 ya!';

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ 
      reply: 'Layanan chat sedang sibuk. Silakan langsung hubungi WhatsApp kami di 0831-9558-5892.' 
    });
  }
}
