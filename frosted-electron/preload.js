const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('frostAPI', {
  minimize: () => ipcRenderer.send('frost:minimize'),
  close: () => ipcRenderer.send('frost:close'),
  moveWindow: (x, y) => ipcRenderer.send('frost:move', { x, y }),
  dragStart: (offset) => ipcRenderer.send('frost:drag-start', offset),
  dragEnd: () => ipcRenderer.send('frost:drag-end'),
  // 恢复归档会话：移除归档标记并重启 DSH 服务（invoke 返回 Promise，完成后由主进程刷新窗口）
  restoreArchived: (sessionIds) => ipcRenderer.invoke('frost:restore-archived', sessionIds),
  // 移动端控制开关：绑定/解绑局域网 IP（invoke 返回 Promise，完成后窗口跳转）
  mobileToggle: () => ipcRenderer.invoke('frost:mobile-toggle'),
})
