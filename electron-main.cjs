const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

// 確保透明視窗在 Windows 上穩定渲染
app.commandLine.appendSwitch('enable-transparent-visuals');

let mainWindow = null;
let isAlwaysOnTop = true;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1180, width - 40),
    height: Math.min(820, height - 40),
    minWidth: 420,
    minHeight: 480,
    x: Math.max(20, Math.round((width - Math.min(1180, width - 40)) / 2)),
    y: Math.max(20, Math.round((height - Math.min(820, height - 40)) / 2)),
    transparent: true,
    frame: false,
    alwaysOnTop: isAlwaysOnTop,
    hasShadow: false,
    resizable: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC 控制：支援前端任何拖曳把手直接流暢移動整個桌面視窗
ipcMain.on('nono-window:move-by', (_event, { dx, dy }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({
    x: Math.round(bounds.x + dx),
    y: Math.round(bounds.y + dy),
    width: bounds.width,
    height: bounds.height,
  });
});

// IPC 控制：支援前端右下角縮放把手直接調整視窗大小
ipcMain.on('nono-window:resize-by', (_event, { dw, dh }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: Math.max(420, Math.round(bounds.width + dw)),
    height: Math.max(480, Math.round(bounds.height + dh)),
  });
});

// IPC 控制：一鍵切換視窗預設尺寸
ipcMain.on('nono-window:set-size', (_event, { width, height }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: Math.max(420, Math.round(width)),
    height: Math.max(480, Math.round(height)),
  });
});

ipcMain.on('nono-window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.handle('nono-window:toggle-top', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return isAlwaysOnTop;
  isAlwaysOnTop = !isAlwaysOnTop;
  mainWindow.setAlwaysOnTop(isAlwaysOnTop);
  return isAlwaysOnTop;
});

ipcMain.on('nono-window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
