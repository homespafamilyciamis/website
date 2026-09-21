// Sementara: validasi struktural (dipakai saat pengembangan, bisa dihapus)
const fs = require('fs');

let adaMasalah = false;
function laporkan(ok, teks) {
  if (!ok) adaMasalah = true;
  console.log((ok ? 'OK   ' : 'FAIL ') + teks);
}

// 1) Semua modul bisa dimuat
const modul = {
  customerStore: require('./customerStore'),
  automationStore: require('./automationStore'),
  waFollowup: require('./waFollowup'),
  waBlast: require('./waBlast'),
  analyst: require('./analyst'),
  geminiClient: require('./geminiClient'),
  apiGuard: require('./apiGuard')
};
laporkan(true, 'modul dimuat');

// 2) Properti modul yang dipakai di semua berkas benar-benar ada
const berkasDiperiksa = [
  'customerStore.js', 'automationStore.js', 'waFollowup.js', 'waBlast.js', 'analyst.js',
  'apiGuard.js', 'api/wa-webhook.js', 'api/customers.js', 'api/broadcast.js',
  'api/automation.js', 'api/analytics.js', 'api/cron/daily.js', 'api/cron/weekly.js'
];

berkasDiperiksa.forEach((berkas) => {
  if (!fs.existsSync(berkas)) {
    laporkan(false, berkas + ' tidak ditemukan');
    return;
  }
  const isi = fs.readFileSync(berkas, 'utf8');
  const hilang = [];

  Object.keys(modul).forEach((namaModul) => {
    const pola = new RegExp('\\b' + namaModul + '\\.([A-Za-z_$][\\w$]*)', 'g');
    let cocok;
    while ((cocok = pola.exec(isi)) !== null) {
      const properti = cocok[1];
      if (properti === 'js') continue; // abaikan nama berkas (mis. customerStore.js)
      if (!(properti in modul[namaModul])) {
        hilang.push(namaModul + '.' + properti);
      }
    }
  });

  laporkan(hilang.length === 0, berkas + (hilang.length ? ' -> properti tidak ada: ' + [...new Set(hilang)].join(', ') : ' semua referensi modul valid'));
});

// 3) admin.html: sintaks JS, id elemen, dan fungsi onclick
const html = fs.readFileSync('public/admin.html', 'utf8');
const skrip = html.match(/<script>([\s\S]*?)<\/script>/);
if (!skrip) {
  laporkan(false, 'admin.html tanpa blok <script>');
} else {
  const kode = skrip[1];

  try {
    // eslint-disable-next-line no-new-func
    new Function(kode);
    laporkan(true, 'admin.html sintaks JS valid');
  } catch (err) {
    laporkan(false, 'admin.html sintaks JS: ' + err.message);
  }

  const idDiHtml = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const idDipakai = new Set([...kode.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]));
  const idHilang = [...idDipakai].filter((x) => !idDiHtml.has(x));
  laporkan(idHilang.length === 0, 'admin.html id elemen' + (idHilang.length ? ' hilang: ' + idHilang.join(', ') : ' lengkap'));

  const onclick = new Set([...html.matchAll(/on\w+="([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1]));
  const fungsiAda = new Set([
    ...[...kode.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
    ...[...kode.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?/g)].map((m) => m[1])
  ]);
  const fungsiHilang = [...onclick].filter((f) => !fungsiAda.has(f));
  laporkan(fungsiHilang.length === 0, 'admin.html fungsi onclick' + (fungsiHilang.length ? ' hilang: ' + fungsiHilang.join(', ') : ' lengkap'));
}

// 4) vercel.json valid & berisi cron
try {
  const vc = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  laporkan(Array.isArray(vc.crons) && vc.crons.length > 0, 'vercel.json cron terpasang (' + (vc.crons || []).length + ')');
  laporkan(Boolean(vc.rewrites && vc.rewrites.length), 'vercel.json rewrite admin subdomain ada');
} catch (err) {
  laporkan(false, 'vercel.json: ' + err.message);
}

console.log(adaMasalah ? '\n== ADA MASALAH ==' : '\n== SEMUA VALIDASI LULUS ==');
