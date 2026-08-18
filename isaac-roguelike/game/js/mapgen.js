/* ============================================================
 * 楼层地图生成：房间网格、门、特殊房（道具房/ Boss 房）、敌人布局
 * 以撒风格：从起点随机游走扩展连通房间，道具房 1 间，Boss 房取离起点最远
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IsoGame = root.IsoGame || {}; root.IsoGame.mapgen = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const C = require('./config.js');

  // 依据楼层难度选择敌人组合
  function buildEnemyLayout(rng, type, floor) {
    const list = [];
    if (type === C.RT.BOSS) return list; // Boss 由 Game 单独生成

    const n = type === C.RT.ITEM ? 0 : Math.min(2 + floor + rng.int(0, 2), 7);

    const pool = ['slime', 'slime', 'fly', 'fly', 'shooter'];
    if (floor >= 2) pool.push('ghost', 'slime', 'shooter');
    if (floor >= 3) pool.push('ghost', 'fly');

    for (let i = 0; i < n; i++) {
      list.push({ type: rng.pick(pool), x: 0, y: 0 }); // x/y 由房间加载时放置
    }
    return list;
  }

  // 生成整层地图。返回 { grid, start, bossPos, itemPos, seed }
  function generateFloor(seed, floor) {
    const rng = new (require('./rng.js').RNG)(seed ^ (floor * 2654435761));
    const W = C.MAP_W, H = C.MAP_H;
    const grid = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) row.push(null);
      grid.push(row);
    }

    const sx = 3 + rng.int(-1, 1), sy = 3 + rng.int(-1, 1);
    const start = { x: sx, y: sy };
    grid[sy][sx] = { x: sx, y: sy, type: C.RT.START, doors: {}, enemies: [] };

    // 随机游走生成房间（以撒式蛇形展开）
    const target = 12 + rng.int(0, 5) + Math.min(floor, 3) * 2;
    let cur = { x: sx, y: sy };
    let steps = 0;
    const maxSteps = 400;

    function connect(a, b) {
      // a->b 方向
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx === 1) { a.doors.E = true; b.doors.W = true; }
      else if (dx === -1) { a.doors.W = true; b.doors.E = true; }
      else if (dy === 1) { a.doors.S = true; b.doors.N = true; }
      else if (dy === -1) { a.doors.N = true; b.doors.S = true; }
    }

    while (steps < maxSteps && countRooms(grid) < target) {
      const d = rng.pick([0, 1, 2, 3]);
      const v = C.DIR_VEC[d];
      const nx = cur.x + v.x, ny = cur.y + v.y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) { cur = start; steps++; continue; }
      // 避免生成太密：若新格子已有房间则换个方向（限制回绕）
      if (grid[ny][nx]) { cur = { x: nx, y: ny }; steps++; continue; }

      // 防止房间过于聚集（检查非连接邻居数量）
      const near = neighbors(grid, nx, ny).length;
      if (near > 1 && rng.chance(0.6)) { steps++; continue; }

      const room = { x: nx, y: ny, type: C.RT.NORMAL, doors: {}, enemies: [] };
      grid[ny][nx] = room;
      connect(grid[cur.y][cur.x], room);
      cur = room;
      steps++;
    }

    // 道具房：从已有房间随机挑一个，替换为道具房（排除起点）
    const normalRooms = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const r = grid[y][x];
      if (r && r.type === C.RT.NORMAL) normalRooms.push(r);
    }
    let itemPos = null;
    if (normalRooms.length > 0) {
      const ir = rng.pick(normalRooms);
      ir.type = C.RT.ITEM;
      itemPos = { x: ir.x, y: ir.y };
    }

    // Boss 房：离起点最远的房间（BFS 距离），替换其类型
    const distMap = bfsDist(grid, start);
    let bossRoom = null, bossDist = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const r = grid[y][x];
      if (r && distMap[y][x] > bossDist) {
        bossDist = distMap[y][x];
        bossRoom = r;
      }
    }
    if (bossRoom && bossRoom !== grid[start.y][start.x]) {
      bossRoom.type = C.RT.BOSS;
    } else {
      // 兜底：把最远正常房变 Boss
      let farthest = null, fd = -1;
      for (const r of normalRooms) if (distMap[r.y][r.x] > fd) { fd = distMap[r.y][r.x]; farthest = r; }
      if (farthest) farthest.type = C.RT.BOSS;
    }
    let bossPos = null;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x] && grid[y][x].type === C.RT.BOSS) bossPos = { x, y };
    }

    // 敌人布局
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const r = grid[y][x];
      if (r && r.type !== C.RT.START) {
        r.enemies = buildEnemyLayout(rng, r.type, floor);
      }
    }

    return { grid, start, bossPos, itemPos, seed, floor };
  }

  function countRooms(grid) {
    let n = 0;
    for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) if (grid[y][x]) n++;
    return n;
  }

  function neighbors(grid, x, y) {
    const out = [];
    if (x > 0 && grid[y][x - 1]) out.push(grid[y][x - 1]);
    if (x < C.MAP_W - 1 && grid[y][x + 1]) out.push(grid[y][x + 1]);
    if (y > 0 && grid[y - 1][x]) out.push(grid[y - 1][x]);
    if (y < C.MAP_H - 1 && grid[y + 1][x]) out.push(grid[y + 1][x]);
    return out;
  }

  function bfsDist(grid, start) {
    const H = grid.length, W = grid[0].length;
    const d = [];
    for (let y = 0; y < H; y++) { const row = []; for (let x = 0; x < W; x++) row.push(-1); d.push(row); }
    const q = [{ x: start.x, y: start.y }];
    d[start.y][start.x] = 0;
    while (q.length) {
      const c = q.shift();
      const cd = d[c.y][c.x];
      for (const nb of neighbors(grid, c.x, c.y)) {
        if (d[nb.y][nb.x] === -1) {
          d[nb.y][nb.x] = cd + 1;
          q.push(nb);
        }
      }
    }
    return d;
  }

  return { generateFloor, buildEnemyLayout };
});
