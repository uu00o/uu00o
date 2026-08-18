/* ============================================================
 * 种子随机数 & 工具函数（无 DOM 依赖，可无头测试）
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IsoGame = root.IsoGame || {}; root.IsoGame.rng = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // mulberry32 种子随机数
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class RNG {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.rand = mulberry32(this.seed);
    }
    next() { return this.rand(); }
    range(min, max) { return min + this.rand() * (max - min); }
    int(min, max) { return Math.floor(this.range(min, max + 1)); }
    chance(p) { return this.rand() < p; }
    pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  }

  // 从字符串生成种子
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function dist(ax, ay, bx, by) { return Math.sqrt(dist2(ax, ay, bx, by)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

  return { mulberry32, RNG, hashSeed, clamp, dist2, dist, lerp, angleTo };
});
