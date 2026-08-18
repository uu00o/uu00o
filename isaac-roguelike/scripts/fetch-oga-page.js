// 抓取 OpenGameArt 页面，解析素材包下载链接
const https = require('https');

const url = process.argv[2] || 'https://opengameart.org/content/tiny-16-basic';
https.get(url, {
  rejectUnauthorized: false,
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
}, (r) => {
  console.log('status:', r.statusCode, 'loc:', r.headers.location || '-');
  if (r.statusCode === 301 || r.statusCode === 302) { r.resume(); return; }
  let d = '';
  r.on('data', (c) => { d += c; });
  r.on('end', () => {
    console.log('html length:', d.length);
    const re = /href=["']([^"']+\.(?:zip|rar|7z))["']/gi;
    const m = [...d.matchAll(re)].map((x) => x[1]);
    console.log('links:', JSON.stringify([...new Set(m)].slice(0, 12)));
    // 也抓表单 action（OpenGameArt 下载走表单提交）
    const form = /<form[^>]+action=["']([^"']+)["'][^>]*>/gi;
    const fm = [...d.matchAll(form)].map((x) => x[1]);
    console.log('forms:', JSON.stringify([...new Set(fm)].slice(0, 12)));
    process.exit(0);
  });
}).on('error', (e) => { console.log('err:', e.message); process.exit(1); });
