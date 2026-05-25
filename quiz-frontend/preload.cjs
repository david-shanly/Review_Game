const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  onFullscreenChange: (callback) => {
    ipcRenderer.on('fullscreen-changed', (event, isFS) => callback(isFS));
  },
  readDb: () => ipcRenderer.invoke('read-db'),
  writeDb: (data) => ipcRenderer.invoke('write-db', data)
});
