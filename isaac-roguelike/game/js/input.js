/* ============================================================
 * input.js — 键盘 + 鼠标输入（浏览器端）
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IsoGame = root.IsoGame || {}; root.IsoGame.input = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEYS = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right'
  };

  class Input {
    constructor(canvas) {
      this.down = {};          // 方向键状态
      this.pressed = {};       // 本帧按下（一次性）
      this.mouseX = 0;
      this.mouseY = 0;
      this.mouseDown = false;
      this._keys = new Set();
      this._pressedKeys = new Set();
      const onKeyDown = (e) => {
        if (KEYS[e.code]) this.down[KEYS[e.code]] = true;
        if (!e.repeat) { this._keys.add(e.code); this._pressedKeys.add(e.code); }
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      };
      const onKeyUp = (e) => {
        if (KEYS[e.code]) this.down[KEYS[e.code]] = false;
        this._keys.delete(e.code);
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', () => {
        this.down = {}; this._keys.clear();
      });

      const updateMouse = (e) => {
        const rect = canvas.getBoundingClientRect();
        this.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
        this.mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
      };
      canvas.addEventListener('mousemove', updateMouse);
      canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouseDown = true; });
      window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // 每帧调用：把屏幕坐标转为游戏世界坐标
    worldAim(ox, oy) {
      return {
        x: (this.mouseX - ox) / 64,
        y: (this.mouseY - oy) / 64
      };
    }

    moveVector() {
      let x = 0, y = 0;
      if (this.down.left) x -= 1;
      if (this.down.right) x += 1;
      if (this.down.up) y -= 1;
      if (this.down.down) y += 1;
      return { x, y };
    }

    fire() {
      return this.mouseDown || this._keys.has('Space');
    }

    // 一次性按键（在 update 后调用 endFrame 清理）
    wasPressed(code) {
      return this._pressedKeys.has(code);
    }

    endFrame() {
      this._pressedKeys.clear();
    }
  }

  return { Input };
});
