const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
} = require('electron');
const path = require('path');

// 確保透明視窗在 Windows 上穩定渲染
app.commandLine.appendSwitch('enable-transparent-visuals');

let mainWindow = null;
let tray = null;
// 預設為 false：讓 Nono 可以自然被其他視窗壓在下方，需要時再隨時喚出或釘選置頂
let isAlwaysOnTop = false;

/**
 * 動態產生 32x32 霓虹撞色小軟糖圖示（供 Windows 工作列與右下角系統匣使用）
 */
function createNonoAppIcon() {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  const cx = 15.5;
  const cy = 15.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const offset = (y * size + x) * 4;

      if (dist <= 14) {
        // BGRA format for Electron createFromBitmap on Windows
        const isBorder = dist > 11.5;
        const isEye =
          (Math.abs(x - 11) <= 1.6 && Math.abs(y - 14) <= 2.2) ||
          (Math.abs(x - 20) <= 1.6 && Math.abs(y - 14) <= 2.2);
        if (isBorder) {
          // 亮青色外框 (#00f5d4 -> B:212, G:245, R:0)
          buf[offset] = 212;
          buf[offset + 1] = 245;
          buf[offset + 2] = 0;
          buf[offset + 3] = 255;
        } else if (isEye) {
          // 深色眼睛
          buf[offset] = 25;
          buf[offset + 1] = 15;
          buf[offset + 2] = 20;
          buf[offset + 3] = 255;
        } else {
          // 莓果粉主體 (#ff1e7a -> B:122, G:30, R:255)
          buf[offset] = 122;
          buf[offset + 1] = 30;
          buf[offset + 2] = 255;
          buf[offset + 3] = 255;
        }
      } else {
        buf[offset] = 0;
        buf[offset + 1] = 0;
        buf[offset + 2] = 0;
        buf[offset + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

/**
 * 將被其他視窗壓在下方的 Nono 立即喚出到最上層
 */
function summonWindowToFront() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  // 在 Windows 上短暫開啟 AlwaysOnTop 再依設定恢復，可保證突破前景鎖定直接跳到最前面
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
  mainWindow.moveTop();
  if (!isAlwaysOnTop) {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !isAlwaysOnTop) {
        mainWindow.setAlwaysOnTop(false);
      }
    }, 150);
  }
}

/**
 * 取消置頂並讓 Nono 退到下層（可被其他視窗壓住）
 */
function sendWindowBehind() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isAlwaysOnTop = false;
  mainWindow.setAlwaysOnTop(false);
  mainWindow.blur();
  mainWindow.webContents.send('nono-window:top-changed', isAlwaysOnTop);
  updateTrayMenu();
}

function setWindowAlwaysOnTop(nextValue) {
  isAlwaysOnTop = Boolean(nextValue);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(isAlwaysOnTop);
    if (isAlwaysOnTop) {
      mainWindow.show();
      mainWindow.focus();
    }
    mainWindow.webContents.send('nono-window:top-changed', isAlwaysOnTop);
  }
  updateTrayMenu();
  return isAlwaysOnTop;
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '✨ 喚出 Nono 到最前面 (Alt+N)',
      click: () => summonWindowToFront(),
    },
    {
      label: isAlwaysOnTop ? '📌 目前：永遠置頂（點此改為可被其他視窗壓住）' : '🔓 目前：一般層級（可被其他視窗蓋住，點此改為永遠置頂）',
      click: () => setWindowAlwaysOnTop(!isAlwaysOnTop),
    },
    {
      label: '⬇ 縮小至工作列',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.minimize();
        }
      },
    },
    { type: 'separator' },
    {
      label: '✕ 關閉 Nono 桌面小夥伴',
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const appIcon = createNonoAppIcon();

  mainWindow = new BrowserWindow({
    title: 'Nono 3D 桌面小夥伴 (Alt+N 隨時喚出)',
    icon: appIcon,
    width: Math.min(1180, width - 40),
    height: Math.min(820, height - 40),
    minWidth: 420,
    minHeight: 480,
    x: Math.max(20, Math.round((width - Math.min(1180, width - 40)) / 2)),
    y: Math.max(20, Math.round((height - Math.min(820, height - 40)) / 2)),
    transparent: true,
    frame: false,
    alwaysOnTop: isAlwaysOnTop,
    skipTaskbar: false,
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

// 單一實例鎖定：如果 Nono 已經在背景或被壓在下面，再次點擊桌面捷徑會直接把 Nono 喚出到最前面！
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    summonWindowToFront();
  });

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

  ipcMain.on('nono-window:send-behind', () => {
    sendWindowBehind();
  });

  ipcMain.on('nono-window:summon-front', () => {
    summonWindowToFront();
  });

  ipcMain.handle('nono-window:get-top', () => {
    return isAlwaysOnTop;
  });

  ipcMain.handle('nono-window:toggle-top', () => {
    return setWindowAlwaysOnTop(!isAlwaysOnTop);
  });

  ipcMain.on('nono-window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    // 建立右下角系統匣圖示（點一下即可把被壓在下方的 Nono 叫出來！）
    try {
      const trayIcon = createNonoAppIcon();
      tray = new Tray(trayIcon);
      tray.setToolTip('Nono 3D 桌面小夥伴 — 點一下喚出到最前面 (快捷鍵 Alt+N)');
      updateTrayMenu();
      tray.on('click', () => {
        summonWindowToFront();
      });
    } catch (err) {
      console.warn('Tray creation skipped:', err);
    }

    // 註冊全局快捷鍵 Alt+N：隨時把被壓在下方的 Nono 叫出來，再按一次可退回下層/縮小
    try {
      globalShortcut.register('Alt+N', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isMinimized() || !mainWindow.isFocused()) {
          summonWindowToFront();
        } else {
          mainWindow.minimize();
        }
      });
    } catch (err) {
      console.warn('Global shortcut registration skipped:', err);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        summonWindowToFront();
      }
    });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
