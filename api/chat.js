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
      reply: 'Kunci API belum terbaca di Vercel. Pastikan GEMINI_API_KEY sudah disimpan di Environment Variables.' 
    });
  }

  // Pengetahuan Resmi & Karakter Santi
  const systemPrompt = `
Kamu adalah "Santi", Customer Service virtual resmi dari "Home Spa Family".
Karakter: Ramah, santun, hangat, bersahabat, profesional, dan solutif layaknya asisten spa pribadi keluarga.

PROFIL & LOKASI HOME SPA FAMILY:
Home Spa Family menyediakan 2 PILIHAN LAYANAN:
1. LAYANAN DI SALON / STUDIO KAMI:
   - Pelanggan bisa datang langsung untuk menikmati perawatan spa & salon di tempat kami yang nyaman dan tenang.
   - Alamat Salon: Jalan Otista, Perum Bumi Ciharalang Lestari, Ciharalang, Cijeungjing - Ciamis.
2. LAYANAN PANGGILAN KE RUMAH (HOME SERVICE):
   - Terapis kami yang datang langsung ke rumah pelanggan di wilayah Ciamis dan sekitarnya (sangat praktis dan privat tanpa perlu keluar rumah).

ATURAN UTAMA MENJAWAB:
1. Jika ditanya "apakah ada tempat/salonnya?", "bisa datang ke lokasi?", atau "alamatnya di mana?":
   - Jawab BISA BANGET! Jelaskan bahwa kami memiliki tempat salon fisik beralamat di Jalan Otista, Perum Bumi Ciharalang Lestari, Ciharalang, Cijeungjing - Ciamis. 
   - Jelaskan juga bahwa pelanggan bebas memilih: mau perawatan langsung di salon kami atau dipanggil ke rumah (home service).
2. Jika ditanya "apakah bisa untuk laki-laki / pria?":
   - Jawab BISA. Home Spa Family adalah spa keluarga yang melayani wanita, pria, anak-anak, ibu hamil, maupun reservasi pasangan/keluarga.
3. Berikan info menu treatment, durasi, dan harga sesuai daftar resmi di bawah.
4. Jika ingin booking: arahkan untuk mengisi formulir "BOOKING ONLINE" di website (pelanggan bisa menulis di catatan apakah ingin treatment di salon atau panggilan ke rumah).
5. Jangan menyuruh pindah ke WhatsApp di setiap jawaban, kecuali pelanggan secara khusus meminta nomor kontak/admin manusia.

PRICELIST RESMI:
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

  const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
  let lastError = '';

  for (const model of models) {
    try {
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

  return res.status(200).json({
    reply: `Maaf Kak, terjadi kendala: ${lastError}`
  });
}
