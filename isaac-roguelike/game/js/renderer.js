/* ============================================================
 * renderer.js — Canvas 渲染：房间、实体、HUD、小地图、图集查看器
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IsoGame = root.IsoGame || {}; root.IsoGame.renderer = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const C = require('./config.js');
  const S = require('./sprites.js');

  const T = { FLOOR: 0, WALL: 1, ROCK: 2, DOOR: 3 };

  class Renderer {
    constructor(canvas, sheets) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.sheets = sheets || null;
      this.viewW = canvas.width;
      this.viewH = canvas.height;
      this.debugSheets = false;   // F1 图集查看器

      // 预生成精灵
      this.sp = {
        player: S.makePlayer(),
        tear: S.makeTear(),
        heart: S.makeHeart(),
        coin: S.makeCoin(),
        key: S.makeKey(),
        pedestal: S.makePedestal(),
        floor: S.makeFloor(),
        wall: S.makeWall(),
        rock: S.makeRock()
      };

      // 敌人精灵缓存
      this.enemySprites = {};
      this.ensureEnemySprite('slime', 'enemySlime');
      this.ensureEnemySprite('ghost', 'enemyGhostBlue');
      this.ensureEnemySprite('fly', 'enemyGhostWhite');
      this.ensureEnemySprite('shooter', 'enemyGhostRed');
    }

    ensureEnemySprite(type, atlasKey) {
      if (this.enemySprites[type]) return;
      const ref = S.TINY16_ATLAS[atlasKey];
      if (!ref || !this.sheets) {
        this.enemySprites[type] = this.makeFallbackEnemy(type);
        return;
      }
      const f = S.getFrame(this.sheets, ref[0], ref[1], ref[2], 3);
      if (f) {
        if (type === 'boss') this.enemySprites[type] = this.tintSprite(f, '#ff4b4b');
        else this.enemySprites[type] = f;
      } else {
        this.enemySprites[type] = this.makeFallbackEnemy(type);
      }
    }

    tintSprite(canvas, color) {
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';
      return c;
    }

    makeFallbackEnemy(type) {
      // Tiny16 未加载时的兜底色块
      const colors = { slime: '#5fc75f', ghost: '#a7c8ff', shooter: '#ff6b6b', boss: '#e04b4b' };
      const c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      const ctx = c.getContext('2d');
      ctx.fillStyle = colors[type] || '#888';
      ctx.beginPath();
      ctx.arc(24, 24, type === 'boss' ? 22 : 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#00000044';
      ctx.beginPath();
      ctx.arc(18, 18, 4, 0, Math.PI * 2);
      ctx.arc(30, 18, 4, 0, Math.PI * 2);
      ctx.fill();
      return c;
    }

    // ---------- 主绘制 ----------
    draw(game, input) {
      const ctx = this.ctx;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, this.viewW, this.viewH);

      if (!game.current) return;

      const room = game.current;
      const roomPx = room.layout.w * C.TILE;
      // 相机
      const px = game.player.x * C.TILE, py = game.player.y * C.TILE;
      let viewX = 0, viewY = 0;
      if (roomPx > this.viewW) viewX = Math.max(0, Math.min(px - this.viewW / 2, roomPx - this.viewW));
      if (roomPx > this.viewH) viewY = Math.max(0, Math.min(py - this.viewH / 2, roomPx - this.viewH));
      const ox = Math.max(0, (this.viewW - roomPx) / 2) - viewX;
      const oy = Math.max(0, (this.viewH - roomPx) / 2) - viewY;
      this.ox = ox;
      this.oy = oy;

      this.drawTiles(ctx, room, ox, oy);
      this.drawDoors(ctx, room, ox, oy);
      this.drawPickups(ctx, room, ox, oy);
      this.drawEnemies(ctx, room, ox, oy);
      this.drawTears(ctx, room, ox, oy);
      this.drawPlayer(ctx, game, ox, oy);

      this.drawHUD(ctx, game);
      this.drawMessages(ctx, game);
      if (game.gameOver) this.drawOverlay(ctx, '游戏结束', '你被击败了……按 R 重新开始', '#8a1f1f');
      if (game.victory) this.drawOverlay(ctx, '胜利！', '你通关了第 ' + C.WIN_FLOOR + ' 层！按 Enter 继续无尽模式，按 R 重新开始', '#1f5f2a');
      if (this.debugSheets) this.drawSheetViewer(ctx, game);
    }

    // ---------- 砖块 ----------
    drawTiles(ctx, room, ox, oy) {
      const t = room.layout.tiles;
      for (let y = 0; y < room.layout.h; y++) {
        for (let x = 0; x < room.layout.w; x++) {
          const tile = t[y][x];
          const dx = ox + x * C.TILE, dy = oy + y * C.TILE;
          let img = this.sp.floor;
          if (tile === T.WALL) img = this.sp.wall;
          else if (tile === T.ROCK) img = this.sp.rock;
          ctx.drawImage(img, dx, dy);
          // 岩石阴影
          if (tile === T.ROCK) {
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(dx + 8, dy + 52, 48, 12);
          }
        }
      }
    }

    drawDoors(ctx, room, ox, oy) {
      const t = room.layout.tiles;
      for (const d of room.layout.doorTiles) {
        const dx = ox + d.x * C.TILE, dy = oy + d.y * C.TILE;
        // 门框
        ctx.fillStyle = '#6b4f2e';
        ctx.fillRect(dx, dy, C.TILE, C.TILE);
        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(dx + 10, dy + 10, C.TILE - 20, C.TILE - 20);
        // 状态标记
        const isItem = room.type === C.RT.ITEM && !room.itemTaken;
        const locked = room.locked;
        const needKey = isItem && this._playerKeys(room) <= 0;
        ctx.font = 'bold 22px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (locked) {
          ctx.fillStyle = '#ff5b5b';
          ctx.fillText('✖', dx + C.TILE / 2, dy + C.TILE / 2 + 2);
        } else if (needKey) {
          ctx.fillStyle = '#ffd93d';
          ctx.fillText('🔑', dx + C.TILE / 2, dy + C.TILE / 2 + 2);
        } else {
          ctx.fillStyle = 'rgba(120,255,120,0.9)';
          ctx.fillText('▶', dx + C.TILE / 2, dy + C.TILE / 2 + 2);
        }
      }
    }

    _playerKeys(room) {
      return this._lastPlayer ? this._lastPlayer.keys : 1;
    }

    // ---------- 实体 ----------
    drawEnemies(ctx, room, ox, oy) {
      for (const e of room.enemies) {
        const img = this.enemySprites[e.type] || this.makeFallbackEnemy(e.type);
        const s = e.type === 'boss' ? 2.8 : 2.4;
        const w = 16 * s, h = 16 * s;
        const dx = ox + e.x * C.TILE - w / 2;
        const dy = oy + e.y * C.TILE - h / 2 + 4;
        if (e.flash > 0) {
          const tinted = this.tintSprite(img, '#ffffff');
          ctx.drawImage(tinted, dx, dy, w, h);
        } else {
          ctx.drawImage(img, dx, dy, w, h);
        }
        // Boss 血条
        if (e.type === 'boss') {
          ctx.fillStyle = '#222';
          ctx.fillRect(dx, dy - 10, w, 6);
          ctx.fillStyle = '#ff4b4b';
          ctx.fillRect(dx, dy - 10, w * Math.max(0, e.hp / e.maxHp), 6);
        }
      }
    }

    drawTears(ctx, room, ox, oy) {
      for (const t of room.tears) {
        const s = t.radius * 2 * C.TILE;
        ctx.drawImage(this.sp.tear, ox + t.x * C.TILE - s / 2, oy + t.y * C.TILE - s / 2, s, s);
      }
    }

    drawPlayer(ctx, game, ox, oy) {
      const pl = game.player;
      if (pl.dead) return;
      if (pl.invuln > 0 && Math.floor(pl.invuln * 12) % 2 === 0) return; // 闪烁无敌
      const w = 64, h = 64;
      const dx = ox + pl.x * C.TILE - w / 2;
      const dy = oy + pl.y * C.TILE - h / 2 - 4;
      // 朝向翻转
      const cosA = Math.cos(pl.aim);
      ctx.save();
      ctx.translate(dx + w / 2, dy + h / 2);
      if (cosA < 0) ctx.scale(-1, 1);
      ctx.drawImage(this.sp.player, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    drawPickups(ctx, room, ox, oy) {
      for (const p of room.pickups) {
        if (p.taken) continue;
        const bob = Math.sin(p.t * 4) * 4;
        const cx = ox + p.x * C.TILE;
        const cy = oy + p.y * C.TILE + bob;
        if (p.type === 'item') {
          // 基座 + 道具光点
          ctx.drawImage(this.sp.pedestal, cx - 32, cy - 16, 64, 64);
          if (room.itemInfo && !room.itemTaken) {
            const glow = 8 + Math.sin(p.t * 5) * 3;
            ctx.fillStyle = room.itemInfo.icon;
            ctx.shadowColor = room.itemInfo.icon;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(cx, cy - 26, glow, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(room.itemInfo.name.slice(0, 1), cx, cy - 22);
          }
        } else if (p.type === 'potion') {
          if (this.sheets) {
            const f = S.getFrame(this.sheets, 'things', 0, 7, 2);
            if (f) ctx.drawImage(f, cx - 16, cy - 16, 32, 32);
          }
        } else {
          const img = this.sp[p.type] || this.sp.coin;
          ctx.drawImage(img, cx - 16, cy - 16, 32, 32);
          // 微光
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.beginPath();
          ctx.arc(cx, cy - 20, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ---------- HUD ----------
    drawHUD(ctx, game) {
      const pl = game.player;
      // 血量（半心）
      const heartW = 22, gap = 4;
      const hx = 12, hy = 12;
      for (let i = 0; i < pl.stats.maxHp; i++) {
        const filled = pl.hp >= i + 1;
        const half = !filled && pl.hp > i;
        ctx.fillStyle = '#331111';
        ctx.fillRect(hx + i * (heartW + gap), hy, heartW, heartW - 4);
        ctx.fillStyle = filled ? '#e04040' : half ? '#a03030' : '#552020';
        ctx.fillRect(hx + i * (heartW + gap) + 1, hy + 1, heartW - 2, heartW - 6);
        if (half) {
          ctx.fillStyle = '#e04040';
          ctx.fillRect(hx + i * (heartW + gap) + 1, hy + 1, (heartW - 2) / 2, heartW - 6);
        }
        ctx.fillStyle = '#ffb3b3';
        ctx.fillRect(hx + i * (heartW + gap) + 3, hy + 3, 5, 4);
      }
      // 金币 / 钥匙
      ctx.font = 'bold 18px "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd93d';
      ctx.fillText('● ' + pl.coins, 12, hy + heartW + 14);
      ctx.fillStyle = '#d9a520';
      ctx.fillText('🗝 ' + pl.keys, 110, hy + heartW + 14);

      // 楼层 & 种子
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '15px "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('第 ' + game.floor + ' 层 · 种子 ' + game.seedString(), this.viewW - 12, 20);

      // 当前房间类型提示
      const typeNames = { start: '出生房', normal: '', item: '道具房', boss: 'BOSS 房' };
      const tn = typeNames[game.current.type];
      if (tn) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '14px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tn, this.viewW / 2, 22);
      }

      this.drawMinimap(ctx, game);
      this.drawItemList(ctx, game);
    }

    drawMinimap(ctx, game) {
      const mw = C.MAP_W * 12, mh = C.MAP_H * 12;
      const mx = this.viewW - mw - 12, my = 34;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
      for (let y = 0; y < C.MAP_H; y++) {
        for (let x = 0; x < C.MAP_W; x++) {
          const r = game.map.grid[y][x];
          if (!r) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(mx + x * 12, my + y * 12, 12, 12); continue; }
          let color = '#5a6070';
          if (r.type === C.RT.START) color = '#4ecdc4';
          if (r.type === C.RT.ITEM) color = '#c792ea';
          if (r.type === C.RT.BOSS) color = '#ff6b6b';
          if (game.current.pos.x === x && game.current.pos.y === y) color = '#ffffff';
          ctx.fillStyle = color;
          ctx.fillRect(mx + x * 12, my + y * 12, 12, 12);
        }
      }
    }

    drawItemList(ctx, game) {
      const pl = game.player;
      if (pl.items.length === 0) return;
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      let y = this.viewH - 28;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('道具：', 12, y);
      for (let i = 0; i < pl.items.length; i++) {
        const it = pl.items[i];
        const def = require('./items.js').ITEM_POOL.find((x) => x.id === it);
        ctx.fillStyle = def ? def.icon : '#888';
        ctx.beginPath();
        ctx.arc(62 + i * 22, y - 4, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---------- 消息 ----------
    drawMessages(ctx, game) {
      ctx.font = 'bold 17px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const baseY = this.viewH - 70;
      game.messages.forEach((m, i) => {
        const a = Math.min(1, m.t);
        ctx.fillStyle = 'rgba(0,0,0,' + (0.5 * a) + ')';
        const w = ctx.measureText(m.text).width + 24;
        ctx.fillRect(this.viewW / 2 - w / 2, baseY - i * 26 - 14, w, 26);
        ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
        ctx.fillText(m.text, this.viewW / 2, baseY - i * 26);
      });
    }

    drawOverlay(ctx, title, subtitle, color) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.font = 'bold 54px "Segoe UI", sans-serif';
      ctx.fillText(title, this.viewW / 2, this.viewH / 2 - 40);
      ctx.fillStyle = '#fff';
      ctx.font = '19px "Segoe UI", sans-serif';
      ctx.fillText(subtitle, this.viewW / 2, this.viewH / 2 + 24);
    }

    // ---------- F1 图集查看器 ----------
    drawSheetViewer(ctx, game) {
      ctx.fillStyle = 'rgba(0,0,0,0.92)';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'left';
      let y = 18;
      ctx.fillText('F1 图集查看器 — Tiny 16 (CC0, Lanea Zimmerman)  按 F1 关闭', 12, y);
      y += 26;

      const keys = ['characters', 'things', 'tiles', 'dead'];
      const sheetKeys = this.sheets ? keys : [];
      const scale = 3;
      const cols = 12;
      for (const key of sheetKeys) {
        const img = this.sheets[key];
        if (!img) continue;
        const cw = img.width * scale, ch = img.height * scale;
        ctx.fillStyle = '#ffd93d';
        ctx.font = '14px monospace';
        ctx.fillText(key + ' (' + img.width + 'x' + img.height + ')', 12, y + 14);
        ctx.fillStyle = '#222';
        ctx.fillRect(12, y + 20, cw, ch);
        ctx.drawImage(img, 12, y + 20, cw, ch);
        // 帧网格
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        for (let fx = 1; fx < img.width / 16; fx++) {
          ctx.beginPath();
          ctx.moveTo(12 + fx * 16 * scale, y + 20);
          ctx.lineTo(12 + fx * 16 * scale, y + 20 + ch);
          ctx.stroke();
        }
        for (let fy = 1; fy < img.height / 16; fy++) {
          ctx.beginPath();
          ctx.moveTo(12, y + 20 + fy * 16 * scale);
          ctx.lineTo(12 + cw, y + 20 + fy * 16 * scale);
          ctx.stroke();
        }
        y += 20 + ch + 14;
        if (y > this.viewH - 80) break;
      }

      // 映射说明
      ctx.fillStyle = '#9fd8ff';
      ctx.font = '13px monospace';
      y += 8;
      ctx.fillText('当前帧映射 (sheet, x, y):', 12, y);
      y += 18;
      for (const name in S.TINY16_ATLAS) {
        const ref = S.TINY16_ATLAS[name];
        ctx.fillText('  ' + name + ' = ' + ref[0] + '(' + ref[1] + ',' + ref[2] + ')', 12, y);
        y += 17;
        if (y > this.viewH - 10) break;
      }
    }
  }

  return { Renderer };
});
