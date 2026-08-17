const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('frostAPI', {
  minimize: () => ipcRenderer.send('frost:minimize'),
  close: () => ipcRenderer.send('frost:close'),
  moveWindow: (x, y) => ipcRenderer.send('frost:move', { x, y }),
  dragStart: (offset) => ipcRenderer.send('frost:drag-start', offset),
  dragEnd: () => ipcRenderer.send('frost:drag-end'),
})
