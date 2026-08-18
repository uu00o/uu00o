/* ============================================================
 * sprites.js — 程序化像素精灵 + Tiny16 免费图集加载（仅浏览器端）
 * 像素图用字符串数组定义，调色板映射字符 -> 颜色
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IsoGame = root.IsoGame || {}; root.IsoGame.sprites = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------- 像素图引擎 ----------
  // map: string[] 每行等长；palette: { char: '#rrggbb' | null }
  function makePixelCanvas(map, palette, scale) {
    const h = map.length;
    const w = map[0].length;
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    const ctx = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const col = palette[map[y][x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return c;
  }

  function canvasFromImage(img, sx, sy, sw, sh) {
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return c;
  }

  function scaleCanvas(src, factor) {
    const c = document.createElement('canvas');
    c.width = src.width * factor;
    c.height = src.height * factor;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  // ---------- 程序化精灵 ----------
  const PLAYER_PAL = {
    '.': null, H: '#5d3a1a', S: '#f2c9a0', W: '#ffffff', D: '#20242c',
    B: '#3b6ea8', A: '#f2c9a0', P: '#3a3f4a', T: '#9fd8ff', R: '#c9503e'
  };
  const PLAYER_MAP = [
    '....HHHHHH...',
    '...HHHHHHHH..',
    '..HHHHHHHHHH.',
    '..HSSSSSSSSH.',
    '..HSSSSSSSSH.',
    '..HSSSSSSSSH.',
    '..SSSSSSSSSS.',
    '..SSWWSSWWSS.',
    '..SSDDSSDDSS.',
    '...SSSSSSSS..',
    '..TSSSSSSSS..',
    '..TTTTTTTTT..',
    '..TTTTTTTTT..',
    '..TATTTTTAT..',
    '...PPPPPPP...',
    '...P..P..P...'
  ];

  const HEART_PAL = {
    '.': null, R: '#d8383e', r: '#a82530', W: '#ffb3b3', D: '#7a1520'
  };
  const HEART_MAP = [
    '....rrrr......',
    '..rrRRRRrr....',
    '.rRRRRRRRRr...',
    'rRRWWRRRRRRr..',
    'rRRWWRRRRRRRr.',
    'rRRRRRRRRRRRr.',
    'rRRRRRRRRRRRr.',
    '.rRRRRRRRRRr..',
    '..rRRRRRRRr...',
    '...rRRRRRr....',
    '....rRRRr.....',
    '.....rrr......',
    '......r.......'
  ];

  const COIN_PAL = {
    '.': null, Y: '#f5c542', y: '#d9a520', D: '#8a6d1a', W: '#fff3c4'
  };
  const COIN_MAP = [
    '....YYYY....',
    '..YYYYYYYY..',
    '.YYYYWWYYYY.',
    '.YYYWWWWYYY.',
    'YYYWWWWWWYYY',
    'YYWDWWWWDWYY',
    'YYWWWWWDWWYY',
    'YYYWWWWWYYY.',
    '.YYYWWWWYYY.',
    '.YYYYWWYYYY.',
    '..YYYYYYYY..',
    '....YYYY....'
  ];

  const KEY_PAL = {
    '.': null, Y: '#f5c542', y: '#c9931e', D: '#8a6d1a'
  };
  const KEY_MAP = [
    '.YYY......',
    'Y...Y.....',
    'Y...Y.....',
    'Y..Y......',
    '.YYY......',
    '...Y......',
    '...YY.....',
    '...Y.Y....',
    '...Y..Y...',
    '...Y...Y..',
    '..YY....Y.',
    '.Y......Y.',
    '........Y.',
    '........Y.',
    '........Y.',
    '.........Y'
  ];

  const PEDESTAL_PAL = {
    '.': null, G: '#7d8794', g: '#5c6570', D: '#3a3f4a', L: '#c9d2dc'
  };
  const PEDESTAL_MAP = [
    '....LLLL....',
    '...LGGGGL...',
    '...LGGGGL...',
    '....GGGG....',
    '....GGGG....',
    '....GggG....',
    '....GggG....',
    '...GGggGG...',
    '...GGggGG...',
    '..GGGGGGGG..',
    '..GDDDDDDG..',
    '..GDDDDDDG..',
    '.GGDDDDDDGG.',
    '.DDDDDDDDDD.',
    '.DDDDDDDDDD.',
    '............'
  ];

  const FLOOR_PAL = { '.': null, A: '#4a4f5c', B: '#454a56', C: '#3f4450' };
  const FLOOR_MAP = [
    'AABBABBAABBA',
    'BAABBAABBAAB',
    'ABBAABBAABBA',
    'BAABBAABBAAB',
    'AABBABBAABBA',
    'BAABBAABBAAB',
    'ABBAABBAABBA',
    'BAABBAABBAAB',
    'AABBABBAABBA',
    'BAABBAABBAAB',
    'ABBAABBAABBA',
    'BAABBAABBAAB'
  ];

  const WALL_PAL = { '.': null, A: '#5a5f6d', B: '#4a4f5c', C: '#3a3e4a', L: '#7d8794' };
  const WALL_MAP = [
    'LLLLLLLLLLLL',
    'AABBCCAABBCC',
    'AABBCCAABBCC',
    'AABBCCAABBCC',
    'AABBCCAABBCC',
    'AABBCCAABBCC',
    'AABBCCAABBCC',
    'AABBCCAABBCC',
    'AABBCCAABBCC',
    'AABBCCAABBCC',
    'AABBCCAABBCC',
    'AABBCCAABBCC'
  ];

  const ROCK_PAL = { '.': null, A: '#6a6f7d', B: '#585d6b', C: '#484c58', D: '#3a3e4a' };
  const ROCK_MAP = [
    '.....AAA....',
    '...AABBBAA..',
    '..ABBBBBBBA.',
    '.ABBBCCCBBBA',
    '.ABBCCCCCBBA',
    'ABBBCCCCCBBBA',
    'ABBBCCCCBBBBA',
    '.ABBCCCCCBBA.',
    '.ABBBCCCBBBA.',
    '..ABBBBBBBA..',
    '...AABBBAA...',
    '.....AAA.....'
  ];

  const TEAR_PAL = { '.': null, T: '#cfeaff', t: '#9fd8ff', W: '#ffffff', D: '#7fb8d8' };
  const TEAR_MAP = [
    '....TT....',
    '..TTTTTT..',
    '.TTTTTTTT.',
    '.TWWTTTTT.',
    'TTWWTTTTTT',
    'TTTTTTTTTT',
    'TTTTTTTTTT',
    'TTTTTTttTT',
    '.TTTTttTT.',
    '.TTTTTTTT.',
    '..TTTTTT..',
    '....TT....'
  ];

  // 凋落的小心（拾取物）——带微光
  function makeHeart() { return makePixelCanvas(HEART_MAP, HEART_PAL, 2); }
  function makeCoin() { return makePixelCanvas(COIN_MAP, COIN_PAL, 2); }
  function makeKey() { return makePixelCanvas(KEY_MAP, KEY_PAL, 2); }
  function makePlayer() { return makePixelCanvas(PLAYER_MAP, PLAYER_PAL, 4); }
  function makeTear() { return makePixelCanvas(TEAR_MAP, TEAR_PAL, 1); }
  function makePedestal() { return makePixelCanvas(PEDESTAL_MAP, PEDESTAL_PAL, 2); }
  function makeFloor() { return makePixelCanvas(FLOOR_MAP, FLOOR_PAL, 4); }
  function makeWall() { return makePixelCanvas(WALL_MAP, WALL_PAL, 4); }
  function makeRock() { return makePixelCanvas(ROCK_MAP, ROCK_PAL, 4); }

  // ---------- Tiny16 免费图集（CC0, Lanea Zimmerman）----------
  const TINY16_SHEETS = {
    characters: { file: 'characters_1.png', cols: 12, rows: 8 },
    things: { file: 'things_0.png', cols: 12, rows: 8 },
    tiles: { file: 'basictiles_2.png', cols: 8, rows: 15 },
    dead: { file: 'dead_1.png', cols: 3, rows: 4 }
  };

  // 游戏中用到的帧映射（坐标 0 基）
  const TINY16_ATLAS = {
    enemySlime: ['characters', 0, 4],
    enemyGhostBlue: ['characters', 7, 5],
    enemyGhostWhite: ['characters', 7, 6],
    enemyGhostRed: ['characters', 9, 4],
    chest: ['things', 0, 0],
    sword: ['things', 3, 0],
    potionGreen: ['things', 0, 7]
  };

  // 加载 Tiny16 图集：返回 { sheetName -> HTMLCanvasElement }
  // resolve(sheets) 在全部加载完成后回调
  function loadTiny16(baseDir, resolve) {
    const images = {};
    let pending = 0;
    const sheets = {};
    for (const name in TINY16_SHEETS) {
      const info = TINY16_SHEETS[name];
      pending++;
      const img = new Image();
      img.onload = function () {
        sheets[name] = img;
        pending--;
        if (pending === 0) resolve(sheets);
      };
      img.onerror = function () {
        pending--;
        if (pending === 0) resolve(sheets);
      };
      img.src = (baseDir || '') + info.file;
      images[name] = img;
    }
  }

  // 从图集中取一帧 16x16 canvas（缩放 scale 倍）
  const frameCache = {};
  function getFrame(sheets, sheetName, x, y, scale) {
    const key = sheetName + '_' + x + '_' + y + '_' + scale;
    if (frameCache[key]) return frameCache[key];
    const img = sheets[sheetName];
    if (!img) return null;
    const f = canvasFromImage(img, x * 16, y * 16, 16, 16);
    const out = scale > 1 ? scaleCanvas(f, scale) : f;
    frameCache[key] = out;
    return out;
  }

  return {
    makePixelCanvas, scaleCanvas,
    makeHeart, makeCoin, makeKey, makePlayer, makeTear, makePedestal,
    makeFloor, makeWall, makeRock,
    TINY16_SHEETS, TINY16_ATLAS, loadTiny16, getFrame
  };
});
