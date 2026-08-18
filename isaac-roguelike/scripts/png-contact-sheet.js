// 纯 Node PNG 工具：解码 PNG → RGBA，放大绘制带坐标标注的对照图 → 编码 PNG
// 用法: node tmp-contactsheet.js <input.png> <output.png> [scale]
const zlib = require('zlib');
const fs = require('fs');

// ---------- PNG 解码 ----------
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const bpp = Math.max(1, Math.floor((channels * bitDepth) / 8));
  const stride = width * channels * (bitDepth / 8);
  const out = Buffer.alloc(width * height * 4);
  // 去滤波（支持 0-4）
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.from(row);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      if (filter === 1) cur[x] = (cur[x] + a) & 0xff;
      else if (filter === 2) cur[x] = (cur[x] + b) & 0xff;
      else if (filter === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) cur[x] = (cur[x] + paeth(a, b, c)) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      if (channels === 4) {
        out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2]; out[di + 3] = cur[si + 3];
      } else if (channels === 3) {
        out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2]; out[di + 3] = 255;
      } else {
        out[di] = cur[si]; out[di + 1] = cur[si]; out[di + 2] = cur[si]; out[di + 3] = 255;
      }
    }
    prev.set(cur);
  }
  return { width, height, rgba: out };
}

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA8
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- 主逻辑 ----------
const input = process.argv[2];
const output = process.argv[3];
const scale = parseInt(process.argv[4] || '8', 10);

const img = decodePNG(fs.readFileSync(input));
const { width, height, rgba } = img;
const FRAME = 16;
const cols = Math.ceil(width / FRAME), rows = Math.ceil(height / FRAME);
const cw = cols * FRAME, ch = rows * FRAME;

const outW = cw * scale, outH = ch * scale + 24;
const out = Buffer.alloc(outW * outH * 4, 0); // 黑色背景

function setPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= outW || y >= outH) return;
  const i = (y * outW + x) * 4;
  out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
}
function fillRect(x0, y0, w, h, r, g, b, a) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(x, y, r, g, b, a);
}
function drawText(s, x0, y0, r, g, b) {
  // 3x5 像素字体（极简）
  const font = {
    '0': ['111','101','101','101','111'], '1': ['010','110','010','010','111'],
    '2': ['111','001','111','100','111'], '3': ['111','001','111','001','111'],
    '4': ['101','101','111','001','001'], '5': ['111','100','111','001','111'],
    '6': ['111','100','111','101','111'], '7': ['111','001','001','001','001'],
    '8': ['111','101','111','101','111'], '9': ['111','101','111','001','111'],
    ',': ['000','000','000','010','100'], '-': ['000','000','111','000','000'],
    '(': ['010','100','100','100','010'], ')': ['010','001','001','001','010'],
    ' ': ['000','000','000','000','000'], ':': ['000','010','000','010','000']
  };
  let cx = x0;
  for (const ch of s) {
    const glyph = font[ch] || font[' '];
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) {
      if (glyph[gy][gx] === '1') setPx(cx + gx, y0 + gy, r, g, b, 255);
    }
    cx += 4;
  }
}

// 放大帧（支持 row=N 只输出一行）
const onlyRow = parseInt(process.argv[5] || '-1', 10);
const rowStart = onlyRow >= 0 ? onlyRow : 0;
const rowEnd = onlyRow >= 0 ? onlyRow + 1 : rows;

for (let fy = rowStart; fy < rowEnd; fy++) {
  for (let fx = 0; fx < cols; fx++) {
    const bx = fx * FRAME, by = fy * FRAME;
    for (let y = 0; y < FRAME; y++) {
      for (let x = 0; x < FRAME; x++) {
        const si = ((by + y) * width + (bx + x)) * 4;
        const r = rgba[si], g = rgba[si + 1], b = rgba[si + 2], a = rgba[si + 3];
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          setPx(bx * scale + x * scale + dx, by * scale + y * scale + dy, r, g, b, a);
        }
      }
    }
    // 网格线
    for (let i = 0; i < FRAME * scale + 1; i++) {
      setPx(bx * scale + i, by * scale, 255, 255, 0, 200);
      setPx(bx * scale, by * scale + i, 255, 255, 0, 200);
    }
    // 标签
    drawText('(' + fx + ',' + fy + ')', bx * scale + 2, ch * scale + 6, 255, 255, 0);
  }
}

fs.writeFileSync(output, encodePNG(outW, outH, out));
console.log('wrote', output, outW + 'x' + outH, 'frames', cols + 'x' + rows, onlyRow >= 0 ? 'row=' + onlyRow : '');
