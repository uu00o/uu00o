/* ============================================================
 * items.js — 道具池：随机增益（以撒风格被动道具）
 * 纯逻辑，无 DOM 依赖
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IsoGame = root.IsoGame || {}; root.IsoGame.items = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 道具定义：id, 名称, 图标字符（渲染用颜色块）, 描述, 应用函数
  const ITEM_POOL = [
    {
      id: 'dmg', name: '锋利眼泪', icon: '#ff6b6b', desc: '攻击力 +0.6',
      apply(p) { p.stats.damage += 0.6; }
    },
    {
      id: 'firerate', name: '连发泪腺', icon: '#4ecdc4', desc: '射速 +18%',
      apply(p) { p.stats.tearDelay *= 0.82; }
    },
    {
      id: 'speed', name: '疾风之靴', icon: '#7fdbff', desc: '移速 +0.25',
      apply(p) { p.stats.speed += 0.25; }
    },
    {
      id: 'range', name: '远射', icon: '#ffd93d', desc: '泪滴射程 +2',
      apply(p) { p.stats.range += 2; }
    },
    {
      id: 'tearsize', name: '大泪滴', icon: '#a29bfe', desc: '泪滴体积 +50%',
      apply(p) { p.stats.tearSize *= 1.5; p.stats.damage += 0.3; }
    },
    {
      id: 'hp', name: '坚韧之心', icon: '#ff4757', desc: '最大红心 +1（回复 1 心）',
      apply(p) { p.stats.maxHp += 1; p.hp = Math.min(p.stats.maxHp, p.hp + 1); }
    },
    {
      id: 'pierce', name: '贯穿泪滴', icon: '#feca57', desc: '泪滴可穿透敌人',
      apply(p) { p.stats.pierce = p.stats.pierce > 0 ? p.stats.pierce + 1 : 1; }
    },
    {
      id: 'homing', name: '追踪泪滴', icon: '#ff9ff3', desc: '泪滴追踪敌人',
      apply(p) { p.stats.homing = p.stats.homing > 0 ? p.stats.homing + 0.5 : 0.5; }
    }
  ];

  const POOL = ITEM_POOL.slice();

  function drawItem(rng, excluded) {
    const pool = POOL.filter((it) => !(excluded && excluded.includes(it.id)));
    if (pool.length === 0) return null;
    return rng.pick(pool);
  }

  return { ITEM_POOL, POOL, drawItem };
});
