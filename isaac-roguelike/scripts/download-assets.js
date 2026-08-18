// 素材下载脚本：从 OpenGameArt 下载免费 CC0 素材（Tiny 16 Basic）
// 用法: node scripts/download-assets.js
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'raw');
fs.mkdirSync(OUT_DIR, { recursive: true });

// OpenGameArt 免费素材: Tiny 16 Basic (Lanea Zimmerman, CC0)
const FILES = [
  {
    name: 'Tiny16Basic.zip',
    url: 'https://opengameart.org/sites/default/files/Tiny16Basic.zip'
  }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`  -> redirect to ${res.headers.location}`);
        res.resume();
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => ws.close(() => resolve(dest)));
      ws.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(new Error('timeout')); });
  });
}

(async () => {
  for (const f of FILES) {
    const dest = path.join(OUT_DIR, f.name);
    try {
      console.log(`Downloading ${f.name} ...`);
      await download(f.url, dest);
      const size = fs.statSync(dest).size;
      console.log(`OK ${f.name} (${size} bytes)`);
    } catch (e) {
      console.log(`FAIL ${f.name}: ${e.message}`);
    }
  }
})();
