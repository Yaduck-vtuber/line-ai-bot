const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nonoDesktop', {
  isElectron: true,
  moveBy: (dx, dy) => ipcRenderer.send('nono-window:move-by', { dx, dy }),
  resizeBy: (dw, dh) => ipcRenderer.send('nono-window:resize-by', { dw, dh }),
  setWindowSize: (width, height) => ipcRenderer.send('nono-window:set-size', { width, height }),
  minimize: () => ipcRenderer.send('nono-window:minimize'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('nono-window:toggle-top'),
  close: () => ipcRenderer.send('nono-window:close'),
});
