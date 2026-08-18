/* ============================================================
 * game.js — 游戏主逻辑（纯逻辑，无 DOM 依赖，可无头测试）
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IsoGame = root.IsoGame || {}; root.IsoGame.game = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const C = require('./config.js');
  const { RNG, hashSeed, dist } = require('./rng.js');
  const mapgen = require('./mapgen.js');
  const roomgen = require('./roomgen.js');
  const { Tear, Player, Enemy, Pickup } = require('./entities.js');
  const items = require('./items.js');

  class Game {
    constructor(seed) {
      this.seed = seed === undefined ? (Math.random() * 0xffffffff) >>> 0 : hashSeed(String(seed));
      this.rng = new RNG(this.seed);
      this.floor = 1;
      this.map = null;
      this.player = null;
      this.current = null;       // 当前房间数据
      this.messages = [];
      this.gameOver = false;
      this.victory = false;
      this.floorClearTimer = -1;
      this.takenItems = [];
      this.stats = { kills: 0, roomsCleared: 0, coinsCollected: 0, damageTaken: 0 };
      this.generateFloor(1);
      this.enterRoom(this.map.start);
    }

    // ---------- 楼层 ----------
    generateFloor(floor) {
      this.floor = floor;
      this.map = mapgen.generateFloor(this.seed, floor);
    }

    nextFloor() {
      const next = this.floor + 1;
      if (this.floor >= C.WIN_FLOOR) {
        this.victory = true;
        return;
      }
      this.generateFloor(next);
      this.enterRoom(this.map.start);
      this.pushMessage('—— 第 ' + next + ' 层 ——', 2.5);
    }

    // 胜利后按 Enter 继续无尽模式
    continueRun() {
      if (!this.victory) return;
      this.victory = false;
      this.generateFloor(this.floor + 1);
      this.enterRoom(this.map.start);
      this.pushMessage('无尽模式：第 ' + this.floor + ' 层', 2.5);
    }

    // ---------- 房间 ----------
    enterRoom(pos) {
      const roomData = this.map.grid[pos.y][pos.x];
      const doors = roomData.doors;
      const layout = roomgen.generateRoom(this.rng, doors);
      const enemies = [];
      const tears = [];
      const pickups = [];
      const isBoss = roomData.type === C.RT.BOSS;
      const isItem = roomData.type === C.RT.ITEM;
      const isStart = roomData.type === C.RT.START;

      // 先确定玩家出生点（入口方向或中心），校验并修正到安全地板格
      const entryTile = this.computeEntryTile(roomData);
      const safeSpawn = roomgen.findSafeSpawn(layout.tiles, entryTile.x, entryTile.y);
      const spawnX = safeSpawn.x + 0.5;
      const spawnY = safeSpawn.y + 0.5;

      // 敌人：远离玩家出生点刷新
      const enemyAvoid = { avoidX: spawnX, avoidY: spawnY };
      for (const e of roomData.enemies) {
        const p = roomgen.spawnPoint(this.rng, layout.tiles,
          Object.assign({ minDist: 3.2 }, enemyAvoid));
        enemies.push(new Enemy(e.type, p.x + 0.5, p.y + 0.5, this.floor));
      }
      if (isBoss) {
        const p = roomgen.spawnPoint(this.rng, layout.tiles,
          Object.assign({ minDist: 4.2 }, enemyAvoid));
        enemies.push(new Enemy('boss', p.x + 0.5, p.y + 0.5, this.floor));
      }

      // 道具房：基座 + 随机道具
      let itemInfo = null;
      if (isItem) {
        itemInfo = items.drawItem(this.rng, this.takenItems);
        if (itemInfo) this.takenItems.push(itemInfo.id);
        pickups.push(new Pickup('item', C.ROOM_W / 2, C.ROOM_H / 2 + 0.6, 0));
      }

      // 起始房：给点补给
      if (isStart) {
        pickups.push(new Pickup('heart', 3.5, 6.5, 1));
        pickups.push(new Pickup('heart', 9.5, 6.5, 1));
        pickups.push(new Pickup('coin', 2.2, 2.2, 1));
        pickups.push(new Pickup('coin', 10.8, 10.8, 1));
      }

      // Boss 房：Boss 死后掉宝箱
      let bossChest = null;
      if (isBoss) bossChest = { opened: false, pickups: [] };

      this.current = {
        pos, type: roomData.type, doors, layout, enemies, tears, pickups,
        cleared: enemies.length === 0,
        locked: enemies.length > 0,          // 有敌人则锁门
        itemInfo, bossChest, itemTaken: false,
        prevPlayerPos: null
      };

      // 玩家入房位置（已校验安全，不在墙/岩石内）
      if (!this.player) {
        this.player = new Player(spawnX, spawnY);
      } else {
        this.player.x = spawnX;
        this.player.y = spawnY;
      }
      this._enteredFrom = null;
    }

    // 玩家出生/传送点（格坐标）：_enteredFrom 为「从哪个门进入」
    // 出生点在对应门内侧，避免卡在墙/岩石里（后续 findSafeSpawn 修正）
    computeEntryTile(roomData) {
      const dir = this._enteredFrom;
      const midX = Math.floor(C.ROOM_W / 2), midY = Math.floor(C.ROOM_H / 2);
      if (dir === C.DIR.S) return { x: midX, y: 2 };              // 从南门进 → 房间顶部
      if (dir === C.DIR.N) return { x: midX, y: C.ROOM_H - 3 };   // 从北门进 → 房间底部
      if (dir === C.DIR.W) return { x: 2, y: midY };              // 从西门进 → 房间右侧
      if (dir === C.DIR.E) return { x: C.ROOM_W - 3, y: midY };   // 从东门进 → 房间左侧
      return { x: midX, y: midY };                                // 首次出生：房间中心
    }

    // ---------- 工具 ----------
    solidAt(x, y, radius, opts) {
      const layout = this.current.layout;
      if (!layout) return false;
      const t = layout.tiles;
      const r = radius || 0.2;
      const xs = [x - r, x + r], ys = [y - r, y + r];
      for (const tx of xs) {
        for (const ty of ys) {
          const ix = Math.floor(tx), iy = Math.floor(ty);
          if (ix < 0 || iy < 0 || ix >= C.ROOM_W || iy >= C.ROOM_H) return true;
          const tile = t[iy][ix];
          if (tile === roomgen.T.WALL) return true;
          if (tile === roomgen.T.ROCK && !(opts && opts.rocks === false)) return true;
        }
      }
      return false;
    }

    pushMessage(text, dur) {
      this.messages.push({ text, t: dur || 1.6 });
      if (this.messages.length > 6) this.messages.shift();
    }

    // ---------- 主更新 ----------
    update(dt, input) {
      if (this.gameOver || this.victory) {
        this.updateMessages(dt);
        return;
      }
      const room = this.current;
      const pl = this.player;

      // 楼层清空过渡
      if (this.floorClearTimer > 0) {
        this.floorClearTimer -= dt;
        this.updateMessages(dt);
        if (this.floorClearTimer <= 0) this.nextFloor();
        return;
      }

      // 输入
      const aimX = input.aimX !== undefined ? input.aimX : pl.x + Math.cos(pl.aim);
      const aimY = input.aimY !== undefined ? input.aimY : pl.y + Math.sin(pl.aim);
      pl.move(input.moveX || 0, input.moveY || 0, dt, (x, y, r, o) => this.solidAt(x, y, r, o));
      if (input.fire) {
        const t = pl.shoot(aimX, aimY);
        if (t) room.tears.push(t);
      }
      pl.update(dt);

      // 泪滴
      const ctx = {
        player: pl,
        enemies: room.enemies,
        solidAt: (x, y, r, o) => this.solidAt(x, y, r, o),
        spawnEnemyTear: (x, y, a, sp, dmg) => {
          room.tears.push(new Tear({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            range: 7, damage: dmg, friendly: false, radius: 0.22
          }));
        },
        spawnEnemy: (type, x, y) => {
          room.enemies.push(new Enemy(type, x, y, this.floor));
          room.locked = true;
        },
        onEnemyKilled: (enemy) => this.onEnemyKilled(enemy)
      };
      for (const t of room.tears) t.update(dt, ctx);
      room.tears = room.tears.filter((t) => !t.dead);

      // 敌人
      for (const e of room.enemies) e.update(dt, ctx);
      room.enemies = room.enemies.filter((e) => !e.dead);

      // 房间清场判定
      if (room.locked && room.enemies.length === 0) {
        room.locked = false;
        room.cleared = true;
        this.stats.roomsCleared++;
        this.pushMessage('房间已清空，可以出发了！', 1.4);
        // Boss 房开宝箱
        if (room.type === C.RT.BOSS && room.bossChest && !room.bossChest.opened) {
          room.bossChest.opened = true;
          const cx = C.ROOM_W / 2, cy = C.ROOM_H / 2 + 1.2;
          room.pickups.push(new Pickup('coin', cx, cy, 5));
          room.pickups.push(new Pickup('heart', cx - 1.2, cy, 1));
          room.pickups.push(new Pickup('key', cx + 1.2, cy, 1));
          room.pickups.push(new Pickup('potion', cx, cy + 1.2, 1));
        }
      }

      // 拾取物
      for (const p of room.pickups) {
        p.update(dt);
        if (!p.taken && dist(pl.x, pl.y, p.x, p.y) < 0.7) {
          if (p.type === 'item') {
            if (room.itemInfo && !room.itemTaken) {
              room.itemTaken = true;
              p.taken = true;
              room.itemInfo.apply(pl);
              pl.items.push(room.itemInfo.id);
              this.pushMessage('获得道具：' + room.itemInfo.name + '（' + room.itemInfo.desc + '）', 2.2);
            }
          } else {
            const msg = p.collect(pl);
            if (msg) this.pushMessage(msg, 1.2);
            if (p.type === 'coin') this.stats.coinsCollected += p.value;
          }
        }
      }

      // 门切换
      this.checkDoors(dt);

      // 死亡
      if (pl.dead) {
        this.gameOver = true;
        this.pushMessage('你死了……按 R 重新开始', 99);
      }

      this.updateMessages(dt);
    }

    updateMessages(dt) {
      for (const m of this.messages) m.t -= dt;
      this.messages = this.messages.filter((m) => m.t > 0);
    }

    checkDoors(dt) {
      const room = this.current;
      const pl = this.player;
      for (const d of room.layout.doorTiles) {
        const cx = d.x + 0.5, cy = d.y + 0.5;
        if (dist(pl.x, pl.y, cx, cy) > 0.85) continue;
        if (room.locked) continue;

        // 道具房需要钥匙
        if (room.type === C.RT.ITEM && !room.itemTaken && pl.keys <= 0) {
          this.pushMessage('道具房需要 1 把钥匙！', 1.5);
          continue;
        }
        if (room.type === C.RT.ITEM && !room.itemTaken && pl.keys > 0) {
          pl.keys--;
          this.pushMessage('消耗 1 把钥匙打开道具房', 1.5);
        }

        // 切换房间
        const v = C.DIR_VEC[d.dir];
        const nx = room.pos.x + v.x, ny = room.pos.y + v.y;
        if (nx < 0 || ny < 0 || nx >= C.MAP_W || ny >= C.MAP_H) continue;
        const target = this.map.grid[ny][nx];
        if (!target) continue;
        this._enteredFrom = (d.dir + 2) % 4;
        this.enterRoom({ x: nx, y: ny });
        return;
      }
    }

    onEnemyKilled(enemy) {
      this.stats.kills++;
      const room = this.current;
      // 掉落
      const roll = this.rng.next();
      if (enemy.type === 'boss') {
        this.floorClearTimer = 2.5;
        this.pushMessage('Boss 被击败！', 2);
      } else {
        if (roll < 0.30) room.pickups.push(new Pickup('coin', enemy.x, enemy.y, 1));
        else if (roll < 0.42) room.pickups.push(new Pickup('heart', enemy.x, enemy.y, 1));
        else if (roll < 0.50) room.pickups.push(new Pickup('key', enemy.x, enemy.y, 1));
        else if (roll < 0.56) room.pickups.push(new Pickup('coin', enemy.x, enemy.y, 2));
      }
    }

    // ---------- 调试/测试辅助 ----------
    currentRoomEnemies() { return this.current ? this.current.enemies : []; }
    currentRoomCleared() { return this.current ? this.current.cleared : false; }
    seedString() { return this.seed.toString(16); }
  }

  return { Game };
});
