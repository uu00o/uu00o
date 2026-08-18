/* ============================================================
 * headless-test.js — 核心逻辑无头测试（无需浏览器/Electron）
 * 运行: npm test  或  node headless-test.js
 * ============================================================ */
'use strict';

const C = require('./game/js/config.js');
const { RNG } = require('./game/js/rng.js');
const mapgen = require('./game/js/mapgen.js');
const roomgen = require('./game/js/roomgen.js');
const { Game } = require('./game/js/game.js');
const items = require('./game/js/items.js');

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  OK ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); }
}

function sim(game, ticks, inputFn) {
  for (let i = 0; i < ticks; i++) {
    const inp = inputFn ? inputFn(i) : { moveX: 0, moveY: 0, aimX: 6.5, aimY: 6.5, fire: false };
    game.update(1 / 60, inp);
  }
}

console.log('== 地图生成 ==');
for (let s = 1; s <= 5; s++) {
  const m = mapgen.generateFloor(s, 1);
  let count = 0, hasStart = false, hasBoss = false, hasItem = false;
  for (let y = 0; y < C.MAP_H; y++) for (let x = 0; x < C.MAP_W; x++) {
    if (m.grid[y][x]) {
      count++;
      if (m.grid[y][x].type === C.RT.START) hasStart = true;
      if (m.grid[y][x].type === C.RT.BOSS) hasBoss = true;
      if (m.grid[y][x].type === C.RT.ITEM) hasItem = true;
    }
  }
  check('种子 ' + s + '：房间数 ' + count + ' >= 10', count >= 10, 'count=' + count);
  check('种子 ' + s + '：含起点/Boss房/道具房', hasStart && hasBoss && hasItem);
}

// 连通性：从起点 BFS 应能到达所有房间
{
  const m = mapgen.generateFloor(42, 1);
  const grid = m.grid;
  const visited = new Set();
  const q = [[m.start.x, m.start.y]];
  visited.add(m.start.x + ',' + m.start.y);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (q.length) {
    const c = q.shift();
    for (const d of dirs) {
      const nx = c[0] + d[0], ny = c[1] + d[1];
      if (nx < 0 || ny < 0 || nx >= C.MAP_W || ny >= C.MAP_H) continue;
      const r = grid[ny][nx];
      if (r && !visited.has(nx + ',' + ny)) { visited.add(nx + ',' + ny); q.push([nx, ny]); }
    }
  }
  let total = 0;
  for (let y = 0; y < C.MAP_H; y++) for (let x = 0; x < C.MAP_W; x++) if (grid[y][x]) total++;
  check('地图连通：BFS 到达 ' + visited.size + '/' + total, visited.size === total, visited.size + '/' + total);
}

console.log('== 基础游戏流程 ==');
const g = new Game('test-seed-1');
check('玩家出生且 6 点血', g.player && g.player.hp === 6);
check('起始房为 START 类型', g.current.type === C.RT.START);
check('起点房有补给（拾取物 > 0）', g.current.pickups.length > 0);

// 射击
{
  const before = g.current.tears.length;
  sim(g, 2, () => ({ moveX: 0, moveY: 0, aimX: g.player.x, aimY: g.player.y - 1, fire: true }));
  check('按左键可射出泪滴', g.current.tears.length > before, g.current.tears.length + ' tears');
  sim(g, 120, () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false }));
  check('泪滴最终消失（飞行结束）', g.current.tears.length === 0);
}

// 拾取红心
{
  const heart = g.current.pickups.find((p) => p.type === 'heart');
  check('起始房有红心补给', !!heart);
  if (heart) {
    g.player.x = heart.x + 0.1;
    g.player.y = heart.y + 0.1;
    g.player.hp = 5;
    sim(g, 5, () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false }));
    check('捡起红心回复 1 血', g.player.hp === 6, 'hp=' + g.player.hp);
    check('红心标记为已取', heart.taken);
  }
}

console.log('== 战斗与清场 ==');
const g2 = new Game('test-fight');
let target = null;
for (let y = 0; y < C.MAP_H; y++) for (let x = 0; x < C.MAP_W; x++) {
  const r = g2.map.grid[y][x];
  if (r && r.type === C.RT.NORMAL && r.enemies.length > 0) target = r;
}
check('存在带敌人的普通房', !!target);
if (target) {
  g2.enterRoom({ x: target.x, y: target.y });
  const n0 = g2.current.enemies.length;
  check('房间内敌人已生成 (' + n0 + ')', n0 > 0);
  check('房间初始锁定', g2.current.locked === true);
  // 泪滴击杀验证：把玩家和敌人传送到房间中心（保证空旷），贴近点射
  const e0 = g2.current.enemies[0];
  e0.hp = 0.5;
  g2.player.x = 6.5;
  g2.player.y = 6.5;
  e0.x = 6.5;
  e0.y = 7.2;
  sim(g2, 5, () => ({ moveX: 0, moveY: 0, aimX: 6.5, aimY: 7.2, fire: true }));
  check('泪滴击中并击杀敌人', e0.dead, 'hp=' + e0.hp + ' dead=' + e0.dead);
  // 清掉剩余敌人，验证房间清场解锁
  for (const e of g2.current.enemies) {
    if (!e.dead) { e.dead = true; g2.onEnemyKilled(e); }
  }
  sim(g2, 5, () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false }));
  check('敌人全部击杀', g2.current.enemies.length === 0);
  check('房间解锁（已清空）', g2.current.locked === false);
  check('击杀统计 > 0', g2.stats.kills > 0);
}

console.log('== 道具房 ==');
const g3 = new Game('test-item');
if (g3.map.itemPos) {
  g3.enterRoom({ x: g3.map.itemPos.x, y: g3.map.itemPos.y });
  check('道具房有随机道具', !!g3.current.itemInfo, g3.current.itemInfo ? g3.current.itemInfo.name : 'none');
  g3.player.x = C.ROOM_W / 2;
  g3.player.y = C.ROOM_H / 2 + 0.5;
  sim(g3, 5, () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false }));
  check('拾取道具（基座触发）', g3.current.itemTaken === true);
  check('道具已收入背包', g3.player.items.length === 1);
}

console.log('== Boss 房与楼层推进 ==');
const g4 = new Game('test-boss');
let bossRoom = null;
for (let y = 0; y < C.MAP_H; y++) for (let x = 0; x < C.MAP_W; x++) {
  const r = g4.map.grid[y][x];
  if (r && r.type === C.RT.BOSS) bossRoom = r;
}
check('存在 Boss 房', !!bossRoom);
if (bossRoom) {
  g4.enterRoom({ x: bossRoom.x, y: bossRoom.y });
  const boss = g4.current.enemies.find((e) => e.type === 'boss');
  check('Boss 已生成', !!boss);
  check('Boss 房锁定', g4.current.locked);
  if (boss) {
    boss.spawned = true;   // 禁用半血召唤，避免干扰测试
    boss.hp = 1;
    let guard = 0;
    while (g4.current.enemies.find((e) => e.type === 'boss') && guard < 6000) {
      const b = g4.current.enemies.find((e) => e.type === 'boss');
      if (!b) break;
      g4.player.x = b.x - 1.5;
      g4.player.y = b.y;
      sim(g4, 10, () => ({ moveX: 0, moveY: 0, aimX: b.x, aimY: b.y, fire: true }));
      guard += 10;
    }
    check('Boss 被击杀', !g4.current.enemies.find((e) => e.type === 'boss'));
    check('Boss 房解锁且宝箱开出', g4.current.locked === false && g4.current.bossChest && g4.current.bossChest.opened);
    check('楼层推进计时启动', g4.floorClearTimer > 0);
    sim(g4, 200, () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false }));
    check('进入第 2 层', g4.floor === 2, 'floor=' + g4.floor);
    check('第 2 层在起点房', g4.current.type === C.RT.START);
  }
}

console.log('== 死亡 ==');
const g5 = new Game('test-death');
g5.player.damage(100, {});
sim(g5, 2, () => ({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false }));
check('血量为 0 时游戏结束', g5.gameOver === true && g5.player.dead === true);

console.log('== 种子确定性 ==');
const ga = new Game('same-seed');
const gb = new Game('same-seed');
const cnt = (gg) => gg.map.grid.flat().filter(Boolean).length;
check('同种子同地图房间数', cnt(ga) === cnt(gb));

console.log('== 道具池 ==');
const rng = new RNG(7);
const d1 = items.drawItem(rng, []);
const d2 = items.drawItem(rng, [d1.id]);
check('道具池可抽取不同道具', d1 && d2 && d1.id !== d2.id, d1.id + ' vs ' + d2.id);

console.log('');
console.log('结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
