/* ============================================================
 * entities.js — 玩家、敌人、泪滴、拾取物（纯逻辑，可无头测试）
 * 坐标单位为「格」（tile），1 格 = TILE 像素
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IsoGame = root.IsoGame || {}; root.IsoGame.entities = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const C = require('./config.js');
  const { clamp, dist, angleTo, RNG } = require('./rng.js');

  // ================= 泪滴 =================
  class Tear {
    constructor(opts) {
      this.x = opts.x; this.y = opts.y;
      this.vx = opts.vx; this.vy = opts.vy;
      this.range = opts.range || C.PLAYER_DEFAULTS.range;   // 剩余飞行格数
      this.damage = opts.damage || 3.5;
      this.radius = opts.radius || C.PLAYER_DEFAULTS.tearSize;
      this.friendly = !!opts.friendly;      // 友方（玩家）泪滴
      this.pierce = opts.pierce || 0;
      this.homing = opts.homing || 0;
      this.dead = false;
      this.gravity = 1.2;                   // 抛物线下坠（以撒特色）
      this.hitSet = new Set();              // 已命中的敌人（防重复）
    }

    update(dt, ctx) {
      this.vy += this.gravity * dt;
      // 追踪（轻微转向最近敌人）
      if (this.homing > 0 && this.friendly) {
        let best = null, bd = 4 * 4;
        for (const e of ctx.enemies) {
          if (e.dead) continue;
          const d = dist(this.x, this.y, e.x, e.y);
          if (d < Math.sqrt(bd)) { bd = d * d; best = e; }
        }
        if (best) {
          const a = angleTo(this.x, this.y, best.x, best.y);
          const cur = Math.atan2(this.vy, this.vx);
          let diff = a - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const na = cur + diff * Math.min(1, this.homing * dt * 3);
          const sp = Math.hypot(this.vx, this.vy);
          this.vx = Math.cos(na) * sp;
          this.vy = Math.sin(na) * sp;
        }
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.range -= Math.hypot(this.vx, this.vy) * dt;

      // 撞击地形（用小半径只查中心，避免出生点贴墙误伤）
      if (ctx.solidAt) {
        const p = ctx.solidAt(this.x, this.y, Math.min(this.radius, 0.12));
        if (p) { this.dead = true; return; }
      }
      if (this.range <= 0) this.dead = true;
      // 出房间边界
      if (this.x < 0 || this.y < 0 || this.x > C.ROOM_W || this.y > C.ROOM_H) this.dead = true;

      // 命中检测
      if (this.friendly) {
        for (const e of ctx.enemies) {
          if (e.dead || this.hitSet.has(e)) continue;
          if (dist(this.x, this.y, e.x, e.y) < e.radius + this.radius) {
            this.hitSet.add(e);
            e.hit(this, ctx);
            if (this.pierce <= 0) { this.dead = true; break; }
            this.pierce--;
          }
        }
      } else {
        const pl = ctx.player;
        if (pl && !pl.dead && pl.invuln <= 0 &&
            dist(this.x, this.y, pl.x, pl.y) < pl.radius + this.radius) {
          pl.damage(this.damage, ctx);
          this.dead = true;
        }
      }
    }
  }

  // ================= 玩家 =================
  class Player {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.radius = 0.28;
      this.aim = 0;
      this.fireCooldown = 0;
      this.invuln = 0;
      this.dead = false;
      this.stats = Object.assign({}, C.PLAYER_DEFAULTS);
      this.hp = this.stats.maxHp;
      this.coins = 0;
      this.keys = 1;
      this.items = [];
      this.sprite = 'player';
    }

    move(dx, dy, dt, solidFn) {
      if (this.dead) return;
      const sp = this.stats.speed;
      const len = Math.hypot(dx, dy);
      if (len > 0) { dx /= len; dy /= len; }
      // 轴向分离移动（防止卡墙）
      this.x += dx * sp * dt;
      if (solidFn(this.x, this.y, this.radius)) {
        this.x -= dx * sp * dt;
      }
      this.y += dy * sp * dt;
      if (solidFn(this.x, this.y, this.radius)) {
        this.y -= dy * sp * dt;
      }
      this.x = clamp(this.x, 0.5, C.ROOM_W - 0.5);
      this.y = clamp(this.y, 0.5, C.ROOM_H - 0.5);
    }

    canFire() { return this.fireCooldown <= 0 && !this.dead; }

    shoot(aimX, aimY) {
      if (!this.canFire()) return null;
      this.fireCooldown = this.stats.tearDelay;
      const a = Math.atan2(aimY - this.y, aimX - this.x);
      this.aim = a;
      const sp = this.stats.shotSpeed;
      const jx = Math.cos(a + Math.PI / 2) * 0.12;
      const jy = Math.sin(a + Math.PI / 2) * 0.12;
      return new Tear({
        x: this.x + Math.cos(a) * 0.45 + jx,
        y: this.y + Math.sin(a) * 0.45 + jy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        range: this.stats.range,
        damage: this.stats.damage * (0.85 + Math.random() * 0.3),
        radius: this.stats.tearSize,
        friendly: true,
        pierce: this.stats.pierce,
        homing: this.stats.homing
      });
    }

    damage(amount, ctx) {
      if (this.dead || this.invuln > 0) return;
      this.hp -= amount;
      this.invuln = 1.2;
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
      }
    }

    heal(amount) {
      if (this.dead) return;
      this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    }

    update(dt) {
      if (this.fireCooldown > 0) this.fireCooldown -= dt;
      if (this.invuln > 0) this.invuln -= dt;
    }
  }

  // ================= 敌人 =================
  class Enemy {
    constructor(type, x, y, floor) {
      this.type = type;
      this.x = x; this.y = y;
      this.dead = false;
      this.flash = 0;
      this.t = Math.random() * 100;
      this.sprite = type;
      const f = floor || 1;
      const scale = 1 + (f - 1) * 0.12;
      switch (type) {
        case 'slime':
          this.hp = 6 * scale; this.maxHp = this.hp;
          this.speed = 0.85 + f * 0.06;
          this.radius = 0.32;
          this.contactDamage = 1;
          this.phaseRock = false;
          break;
        case 'ghost':
          this.hp = 3 * scale; this.maxHp = this.hp;
          this.speed = 1.9;
          this.radius = 0.3;
          this.contactDamage = 1;
          this.phaseRock = true;
          break;
        case 'fly':
          this.hp = 2 * scale; this.maxHp = this.hp;
          this.speed = 2.4;
          this.radius = 0.25;
          this.contactDamage = 1;
          this.phaseRock = true;
          break;
        case 'shooter':
          this.hp = 8 * scale; this.maxHp = this.hp;
          this.speed = 1.1;
          this.radius = 0.34;
          this.contactDamage = 1;
          this.phaseRock = false;
          this.shootTimer = 1.5 + Math.random();
          this.keepDist = 4.2;
          break;
        case 'boss':
          this.hp = 55 + f * 30; this.maxHp = this.hp;
          this.speed = 1.0;
          this.radius = 0.72;
          this.contactDamage = 1.5;
          this.phaseRock = false;
          this.shootTimer = 2.5;
          this.spawned = false;
          this.charging = 0;
          this.sprite = 'boss';
          break;
        default:
          this.hp = 4; this.maxHp = 4; this.speed = 0.8; this.radius = 0.3;
          this.contactDamage = 1; this.phaseRock = false;
      }
    }

    hit(tear, ctx) {
      if (this.dead) return;
      this.hp -= tear.damage;
      this.flash = 0.12;
      // 击退
      const a = Math.atan2(this.y - tear.y, this.x - tear.x);
      this.x += Math.cos(a) * 0.12;
      this.y += Math.sin(a) * 0.12;
      if (this.hp <= 0) {
        this.dead = true;
        ctx.onEnemyKilled && ctx.onEnemyKilled(this);
      }
    }

    update(dt, ctx) {
      const pl = ctx.player;
      if (this.dead) return;
      this.t += dt;
      if (this.flash > 0) this.flash -= dt;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const d = Math.hypot(dx, dy) || 0.001;

      switch (this.type) {
        case 'slime': {
          // 缓慢追击，带轻微摇摆
          const wob = Math.sin(this.t * 3) * 0.35;
          const a = Math.atan2(dy, dx) + wob * 0.06;
          this.move(a, this.speed, dt, ctx);
          break;
        }
        case 'ghost': {
          // 快速正弦漂移，穿岩石
          const wob = Math.sin(this.t * 4) * 0.9;
          const a = Math.atan2(dy, dx);
          const ta = a + Math.sin(this.t * 2.4) * 0.5;
          this.move(ta, this.speed, dt, ctx);
          break;
        }
        case 'fly': {
          // 高速之字形扑向玩家
          const ta = Math.atan2(dy, dx) + Math.sin(this.t * 5.5) * 0.8;
          this.move(ta, this.speed, dt, ctx);
          break;
        }
        case 'shooter': {
          // 保持距离射击
          this.shootTimer -= dt;
          if (d < this.keepDist - 0.5) {
            this.move(Math.atan2(dy, dx) + Math.PI, this.speed, dt, ctx);
          } else if (d > this.keepDist + 0.5) {
            this.move(Math.atan2(dy, dx), this.speed, dt, ctx);
          } else {
            this.move(0, 0, dt, ctx); // 不动但保留摇摆
          }
          if (this.shootTimer <= 0) {
            this.shootTimer = 2.1 + Math.random() * 0.6;
            const a = Math.atan2(dy, dx);
            ctx.spawnEnemyTear(this.x, this.y, a, 4.2, 1);
          }
          break;
        }
        case 'boss': {
          this.shootTimer -= dt;
          if (this.charging > 0) {
            this.charging -= dt;
            this.move(Math.atan2(dy, dx), this.speed * 3.2, dt, ctx);
            if (this.charging <= 0) this.shootTimer = Math.max(0.6, this.shootTimer);
          } else {
            this.move(Math.atan2(dy, dx), this.speed, dt, ctx);
          }
          if (this.shootTimer <= 0) {
            this.shootTimer = 3.0;
            // 径向弹幕
            const n = 8;
            for (let i = 0; i < n; i++) {
              const a = (Math.PI * 2 * i) / n + this.t * 0.3;
              ctx.spawnEnemyTear(this.x, this.y, a, 3.2, 1);
            }
            // 有时冲刺
            if (Math.random() < 0.4) this.charging = 1.2;
          }
          if (!this.spawned && this.hp < this.maxHp * 0.5) {
            this.spawned = true;
            ctx.spawnEnemy('slime', this.x + 1.2, this.y);
            ctx.spawnEnemy('slime', this.x - 1.2, this.y);
          }
          break;
        }
      }

      // 接触伤害
      if (d < this.radius + pl.radius && pl.invuln <= 0 && !pl.dead) {
        pl.damage(this.contactDamage, ctx);
      }
    }

    move(angle, speed, dt, ctx) {
      const nx = this.x + Math.cos(angle) * speed * dt;
      const ny = this.y + Math.sin(angle) * speed * dt;
      const solidFn = ctx.solidAt || (() => false);
      if (this.phaseRock) {
        // 幽灵只撞墙，不撞岩石
        if (!solidFn(nx, this.y, this.radius, { rocks: false })) this.x = nx;
        if (!solidFn(this.x, ny, this.radius, { rocks: false })) this.y = ny;
      } else {
        if (!solidFn(nx, this.y, this.radius)) this.x = nx;
        if (!solidFn(this.x, ny, this.radius)) this.y = ny;
      }
      this.x = clamp(this.x, 0.4, C.ROOM_W - 0.4);
      this.y = clamp(this.y, 0.4, C.ROOM_H - 0.4);
    }
  }

  // ================= 拾取物 =================
  class Pickup {
    constructor(type, x, y, value) {
      this.type = type;     // 'heart' | 'coin' | 'key' | 'item' | 'potion'
      this.x = x; this.y = y;
      this.value = value || 1;
      this.t = Math.random() * 10;
      this.taken = false;
      this.sprite = type;
    }

    update(dt) { this.t += dt; }

    collect(player) {
      if (this.taken) return null;
      let msg = null;
      switch (this.type) {
        case 'heart':
          player.heal(1);
          msg = '+1 红心';
          break;
        case 'coin':
          player.coins += this.value;
          msg = '+' + this.value + ' 金币';
          break;
        case 'key':
          player.keys += this.value;
          msg = '+' + this.value + ' 钥匙';
          break;
        case 'potion':
          player.heal(2);
          msg = '药水：回复 2 心';
          break;
        case 'item':
          return null; // 道具房物品由 game 处理（需展示名字）
        default:
          return null;
      }
      this.taken = true;
      return msg;
    }
  }

  return { Tear, Player, Enemy, Pickup };
});
