const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Review Game Group C - 2026',
    icon: path.join(__dirname, 'dist', 'logo.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
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

  // Monitor fullscreen state changes and notify the frontend
  win.on('enter-fullscreen', () => {
    win.webContents.send('fullscreen-changed', true);
  });
  win.on('leave-fullscreen', () => {
    win.webContents.send('fullscreen-changed', false);
  });
}

// IPC handler to toggle native window fullscreen
ipcMain.on('toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setFullScreen(!win.isFullScreen());
  }
});

// IPC handler to query current native window fullscreen state
ipcMain.handle('is-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isFullScreen() : false;
});

// IPC handler to read DB from user data
ipcMain.handle('read-db', () => {
  const dbPath = path.join(app.getPath('userData'), 'questions.json');
  try {
    if (fs.existsSync(dbPath)) {
      return fs.readFileSync(dbPath, 'utf8');
    }
    return null;
  } catch (err) {
    console.error('Failed to read native DB:', err);
    return null;
  }
});

// IPC handler to write DB to user data
ipcMain.handle('write-db', (event, dataString) => {
  const dbPath = path.join(app.getPath('userData'), 'questions.json');
  try {
    fs.writeFileSync(dbPath, dataString, 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write native DB:', err);
    return false;
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
