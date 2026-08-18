// 预加载脚本：暴露最小化的安全 API（当前游戏不需要 Node 能力）
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('gameInfo', {
  version: '0.1.0',
  platform: process.platform
});
