const { app, BrowserWindow, shell, Menu } = require('electron');
const net = require('net');
const path = require('path');
const { pathToFileURL } = require('url');

const PREFERRED_PORT = 47173;

function isFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}
async function pickPort() {
  if (await isFree(PREFERRED_PORT)) return PREFERRED_PORT;
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win;
async function start() {
  const port = await pickPort();
  process.env.PORT = String(port);
  process.env.MOJ_PLAN_DATA_DIR = app.getPath('userData'); process.env.MOJ_PLAN_DESKTOP = '1'; globalThis.__mojQuit = () => app.quit();
  await import(pathToFileURL(path.join(__dirname, '..', 'server.js')).href);
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 420, minHeight: 600,
    title: 'Mój plan', backgroundColor: '#12121a', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'icon-512.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`http://127.0.0.1:${port}`) && !url.startsWith(`http://localhost:${port}`)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(start).catch((e) => { console.error(e); app.quit(); });
app.on('window-all-closed', () => app.quit());
