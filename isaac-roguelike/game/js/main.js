/* ============================================================
 * main.js — 浏览器启动：加载图集、主循环、按键处理
 * ============================================================ */
(function () {
  'use strict';

  const IsoGame = window.IsoGame;
  const { Game } = IsoGame.game;
  const { Renderer } = IsoGame.renderer;
  const S = IsoGame.sprites;
  const { Input } = IsoGame.input;

  const canvas = document.getElementById('game');
  const ctx2d = canvas.getContext('2d');
  const input = new Input(canvas);

  let game = null;
  let renderer = null;
  let lastT = performance.now();

  function newGame(seed) {
    game = new Game(seed);
    window.__game = game;   // 调试/冒烟测试句柄
    if (renderer) renderer.sheets = loadedSheets;
    game.pushMessage('WASD/方向键 移动 · 鼠标瞄准 · 左键/空格 射击', 4);
    game.pushMessage('第 ' + game.floor + ' 层：清空房间，找到 BOSS 房！', 3);
  }

  let loadedSheets = null;

  // 先加载 Tiny16 图集，再开始游戏
  S.loadTiny16('../assets/sprites/', (sheets) => {
    loadedSheets = sheets;
    renderer = new Renderer(canvas, sheets);
    newGame(undefined);
    requestAnimationFrame(loop);
  });

  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    if (!game || !renderer) return requestAnimationFrame(loop);

    // 输入 → 世界坐标
    const mv = input.moveVector();
    const aim = input.worldAim(renderer.ox || 0, renderer.oy || 0);
    const inputState = {
      moveX: mv.x, moveY: mv.y,
      aimX: aim.x, aimY: aim.y,
      fire: input.fire()
    };

    game.update(dt, inputState);
    renderer.draw(game, inputState);

    // 按键
    if (input.wasPressed('KeyR')) {
      newGame(undefined);
    }
    if (input.wasPressed('F1')) {
      renderer.debugSheets = !renderer.debugSheets;
    }
    if (input.wasPressed('Enter') && game.victory) {
      game.continueRun();
    }
    input.endFrame();

    requestAnimationFrame(loop);
  }
})();
