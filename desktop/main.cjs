const { app, BrowserWindow, dialog, screen, shell } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');

let server;
let window;
let quitting = false;

function startServer() {
  return new Promise((resolve, reject) => {
    const root = app.getAppPath();
    server = fork(path.join(root, 'build/server/index.mjs'), [], {
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', SMARTCNC_DIST_PATH: path.join(root, 'dist'), PORT: '3000' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let errors = '';
    server.stderr.on('data', data => { errors += data.toString(); });
    server.once('error', reject);
    server.once('exit', code => {
      if (!quitting) {
        const message = `Le serveur SmartCNC s'est arrêté (code ${code}).\n${errors}`;
        reject(new Error(message));
        if (window) { dialog.showErrorBox('SmartCNC', message); app.quit(); }
      }
    });
    server.on('message', message => { if (message?.type === 'ready') resolve(); });
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const width = Math.min(1440, workArea.width);
    const height = Math.min(900, workArea.height);
    window = new BrowserWindow({
      x: workArea.x + Math.floor((workArea.width - width) / 2),
      y: workArea.y + Math.floor((workArea.height - height) / 2),
      width, height, minWidth: Math.min(720, width), minHeight: Math.min(480, height),
      title: 'SmartCNC', autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
      return { action: 'deny' };
    });
    await window.loadURL('http://localhost:3000');
  } catch (error) {
    dialog.showErrorBox('Impossible de démarrer SmartCNC', String(error));
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  quitting = true;
  if (server) server.kill();
});
