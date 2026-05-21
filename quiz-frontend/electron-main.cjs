const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Review Game Group C - 2026',
    icon: path.join(__dirname, 'public', 'logo.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#07112B',
    show: false,
    fullscreen: true,
  });

  // Load the built Vite app
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  // Remove menu bar for kiosk-style presentation
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
