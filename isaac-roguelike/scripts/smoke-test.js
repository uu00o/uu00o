// 冒烟测试：用 Electron 加载游戏页，检查初始化状态并截图
// 运行: node_modules\electron\dist\electron.exe scripts/smoke-test.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'smoke-shot.png');
const LOG = path.join(__dirname, '..', 'smoke-log.txt');

// 用全新 userData 目录，避免 V8 代码缓存导致旧脚本残留
app.setPath('userData', path.join(require('os').tmpdir(), 'dsh-smoke-' + Date.now()));

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 960, height: 640,
      show: false,
      webPreferences: { offscreen: true }
    });
    const logs = [];
    win.webContents.on('console-message', (e, level, message, line, sourceId) => {
      logs.push('console[' + level + '] ' + message + ' @' + sourceId + ':' + line);
    });
    win.webContents.on('render-process-gone', (e, details) => {
      logs.push('render-process-gone: ' + JSON.stringify(details));
    });
    await win.webContents.session.clearCache();
    await win.loadFile(path.join(__dirname, '..', 'game', 'index.html'), { query: { v: Date.now() } });
    await new Promise((r) => setTimeout(r, 3000));

    const state = await win.webContents.executeJavaScript(`(() => {
      const ig = window.IsoGame;
      const g = window.__game;
      let canvasInfo = null;
      const cv = document.getElementById('game');
      if (cv) {
        const ctx = cv.getContext('2d');
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let nonZero = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nonZero++;
        canvasInfo = { w: cv.width, h: cv.height, paintedPixels: nonZero };
      }
      return {
        hasIsoGame: !!ig,
        gameInit: !!g,
        playerHp: g ? g.player.hp : -1,
        floor: g ? g.floor : -1,
        roomType: g && g.current ? g.current.type : null,
        roomEnemies: g && g.current ? g.current.enemies.length : -1,
        mapRooms: g && g.map ? g.map.grid.flat().filter(Boolean).length : -1,
        canvas: canvasInfo
      };
    })()`);
    logs.push('STATE ' + JSON.stringify(state));

    const img = await win.webContents.capturePage();
    fs.writeFileSync(OUT, img.toPNG());
    logs.push('SCREENSHOT ' + OUT + ' bytes=' + img.toPNG().length);

    fs.writeFileSync(LOG, logs.join('\n'));

    // 第二张：进入带敌人的普通房并开火
    const fightInfo = await win.webContents.executeJavaScript(`(() => {
      const g = window.__game;
      let target = null;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const r = g.map.grid[y][x];
        if (r && r.type === 'normal' && r.enemies.length > 0) target = r;
      }
      if (!target) return { error: 'no normal room' };
      g.enterRoom({ x: target.x, y: target.y });
      const e0 = g.current.enemies[0];
      g.player.x = e0.x;
      g.player.y = e0.y - 2.5;
      for (let i = 0; i < 60; i++) {
        g.update(1 / 60, { moveX: 0, moveY: 0, aimX: e0.x, aimY: e0.y, fire: true });
      }
      return {
        enemyTypes: g.current.enemies.map((e) => e.type),
        enemies: g.current.enemies.length,
        tears: g.current.tears.length,
        e0hp: Math.round(e0.hp * 10) / 10,
        locked: g.current.locked
      };
    })()`);
    logs.push('FIGHT ' + JSON.stringify(fightInfo));
    const img2 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '..', 'smoke-shot2.png'), img2.toPNG());
    logs.push('SHOT2 bytes=' + img2.toPNG().length);

    // 第三张：Boss 房
    const bossInfo = await win.webContents.executeJavaScript(`(() => {
      const g = window.__game;
      let bossRoom = null;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const r = g.map.grid[y][x];
        if (r && r.type === 'boss') bossRoom = r;
      }
      if (!bossRoom) return { error: 'no boss room' };
      g.enterRoom({ x: bossRoom.x, y: bossRoom.y });
      return {
        boss: !!g.current.enemies.find((e) => e.type === 'boss'),
        locked: g.current.locked
      };
    })()`);
    logs.push('BOSS ' + JSON.stringify(bossInfo));
    await new Promise((r) => setTimeout(r, 500));
    const img3 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '..', 'smoke-shot3.png'), img3.toPNG());
    logs.push('SHOT3 bytes=' + img3.toPNG().length);

    fs.writeFileSync(LOG, logs.join('\n'));
    app.exit(0);
  } catch (e) {
    fs.writeFileSync(LOG, 'ERROR ' + (e && e.stack ? e.stack : String(e)));
    app.exit(2);
  }
});

setTimeout(() => { console.log('TIMEOUT'); app.exit(3); }, 20000);
