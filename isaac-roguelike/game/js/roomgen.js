/* ============================================================
 * roomgen.js — 单个房间的砖块布局：外墙、内部障碍（岩石）、门位
 * 纯逻辑，无 DOM 依赖
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IsoGame = root.IsoGame || {}; root.IsoGame.roomgen = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const C = require('./config.js');
  const { RNG } = require('./rng.js');

  // 砖块类型
  const T = { FLOOR: 0, WALL: 1, ROCK: 2, DOOR: 3 };

  // 生成房间砖块布局
  // doors: { N:bool, E:bool, S:bool, W:bool }
  function generateRoom(rng, doors) {
    const W = C.ROOM_W, H = C.ROOM_H;
    const tiles = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) row.push(T.WALL);
      tiles.push(row);
    }

    // 内部地板
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) tiles[y][x] = T.FLOOR;
    }

    // 门：边框墙中点
    const doorTiles = [];
    const midX = Math.floor(W / 2), midY = Math.floor(H / 2);
    if (doors.N) { tiles[0][midX] = T.DOOR; doorTiles.push({ x: midX, y: 0, dir: C.DIR.N }); }
    if (doors.S) { tiles[H - 1][midX] = T.DOOR; doorTiles.push({ x: midX, y: H - 1, dir: C.DIR.S }); }
    if (doors.E) { tiles[midY][W - 1] = T.DOOR; doorTiles.push({ x: W - 1, y: midY, dir: C.DIR.E }); }
    if (doors.W) { tiles[midY][0] = T.DOOR; doorTiles.push({ x: 0, y: midY, dir: C.DIR.W }); }

    // 门内侧地板清空（保证通路）
    for (const d of doorTiles) {
      const v = C.DIR_VEC[d.dir];
      const ix = d.x + v.x, iy = d.y + v.y;
      if (ix >= 1 && ix < W - 1 && iy >= 1 && iy < H - 1) tiles[iy][ix] = T.FLOOR;
      // 门左右/上下两格也留空，方便进入
      const px = d.x + v.y, py = d.y + v.x;   // 垂直方向
      const nx2 = d.x - v.y, ny2 = d.y - v.x;
      if (px >= 0 && px < W && py >= 0 && py < H) tiles[py][px] = T.FLOOR;
      if (nx2 >= 0 && nx2 < W && ny2 >= 0 && ny2 < H) tiles[ny2][nx2] = T.FLOOR;
    }

    // 内部随机岩石障碍（避开中心区与门口通路）
    const nRocks = rng.int(2, 6);
    for (let i = 0; i < nRocks * 4; i++) {
      if (i > 100) break;
      const x = rng.int(2, W - 3);
      const y = rng.int(2, H - 3);
      if (tiles[y][x] !== T.FLOOR) continue;
      // 避开中心 5x5（出生/战斗区域）
      if (Math.abs(x - midX) <= 2 && Math.abs(y - midY) <= 2) continue;
      // 避开门口通路
      let nearDoor = false;
      for (const d of doorTiles) {
        if (Math.abs(d.x - x) <= 1 && Math.abs(d.y - y) <= 1) { nearDoor = true; break; }
      }
      if (nearDoor) continue;
      tiles[y][x] = T.ROCK;
    }

    return { tiles, doorTiles, w: W, h: H };
  }

  // 敌人在房间内的随机出生点（避开中心，可选避开玩家出生点）
  // opts: { avoidX, avoidY, minDist } — avoidX/Y 为房间坐标（格），minDist 为最小距离
  function spawnPoint(rng, tiles, opts) {
    opts = opts || {};
    const W = tiles[0].length, H = tiles.length;
    const midX = Math.floor(W / 2), midY = Math.floor(H / 2);
    const hasAvoid = opts.avoidX !== undefined && opts.avoidY !== undefined;
    const minDist = opts.minDist || 0;
    for (let i = 0; i < 400; i++) {
      const x = rng.int(1, W - 2);
      const y = rng.int(1, H - 2);
      if (tiles[y][x] !== T.FLOOR) continue;
      if (Math.abs(x - midX) <= 1 && Math.abs(y - midY) <= 1) continue;
      if (hasAvoid) {
        const d = Math.hypot(x + 0.5 - opts.avoidX, y + 0.5 - opts.avoidY);
        if (d < minDist) continue;
      }
      return { x, y };
    }
    // 兜底：遍历选择离玩家最远的可行地板格
    let best = null, bestD = -1;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (tiles[y][x] !== T.FLOOR) continue;
        const d = hasAvoid ? Math.hypot(x + 0.5 - opts.avoidX, y + 0.5 - opts.avoidY) : 0;
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
    }
    return best || { x: 2, y: 2 };
  }

  // 从期望位置向外螺旋搜索最近的可行地板格（出生/传送点校验，返回格坐标）
  function findSafeSpawn(tiles, tx, ty) {
    const W = tiles[0].length, H = tiles.length;
    const limit = Math.max(W, H);
    for (let r = 0; r < limit; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx, y = ty + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (tiles[y][x] === T.FLOOR) return { x, y };
        }
      }
    }
    return { x: Math.floor(W / 2), y: Math.floor(H / 2) };
  }

  function isSolid(tile) {
    return tile === T.WALL || tile === T.ROCK;
  }

  return { T, generateRoom, spawnPoint, findSafeSpawn, isSolid };
});
