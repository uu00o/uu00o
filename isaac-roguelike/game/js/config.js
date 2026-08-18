/* ============================================================
 * 全局配置常量
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IsoGame = root.IsoGame || {}; root.IsoGame.config = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TILE = 64;          // 每个格子像素大小
  const ROOM_W = 13;        // 房间宽（格）
  const ROOM_H = 13;        // 房间高（格）

  // 地图网格尺寸
  const MAP_W = 8;
  const MAP_H = 8;

  const FPS = 60;

  // 玩家默认属性
  const PLAYER_DEFAULTS = {
    maxHp: 6,               // 6 颗半红心 = 3 整红心
    damage: 3.5,
    tearDelay: 0.38,        // 秒 / 发
    speed: 2.4,             // 格/秒
    range: 6.5,             // 泪滴飞行格数
    shotSpeed: 9,           // 泪滴速度 格/秒
    tearSize: 0.55,         // 泪滴半径（格）
    pierce: 0,
    homing: 0
  };

  // 楼层数 -> 达到即胜利（Boss 战后进入下一层；击败第 WIN_FLOOR 层 Boss 胜利）
  const WIN_FLOOR = 3;

  // 房间类型
  const RT = { START: 'start', NORMAL: 'normal', ITEM: 'item', BOSS: 'boss' };

  // 方向
  const DIR = { N: 0, E: 1, S: 2, W: 3 };
  const DIR_VEC = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];

  return {
    TILE, ROOM_W, ROOM_H, MAP_W, MAP_H, FPS,
    PLAYER_DEFAULTS, WIN_FLOOR, RT, DIR, DIR_VEC
  };
});
