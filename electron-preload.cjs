const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nonoDesktop', {
  isElectron: true,
  moveBy: (dx, dy) => ipcRenderer.send('nono-window:move-by', { dx, dy }),
  resizeBy: (dw, dh) => ipcRenderer.send('nono-window:resize-by', { dw, dh }),
  setWindowSize: (width, height) => ipcRenderer.send('nono-window:set-size', { width, height }),
  minimize: () => ipcRenderer.send('nono-window:minimize'),
  sendBehind: () => ipcRenderer.send('nono-window:send-behind'),
  summonToFront: () => ipcRenderer.send('nono-window:summon-front'),
  getAlwaysOnTop: () => ipcRenderer.invoke('nono-window:get-top'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('nono-window:toggle-top'),
  onAlwaysOnTopChanged: (callback) => {
    const listener = (_event, val) => callback(val);
    ipcRenderer.on('nono-window:top-changed', listener);
    return () => ipcRenderer.removeListener('nono-window:top-changed', listener);
  },
  close: () => ipcRenderer.send('nono-window:close'),
});
