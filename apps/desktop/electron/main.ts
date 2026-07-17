import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'NexusDesk',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    void autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('secure-store:set', (_event, key: string, value: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false };
  }
  const encrypted = safeStorage.encryptString(value);
  const store =
    ((globalThis as unknown as { __ndStore?: Record<string, string> }).__ndStore ??= {});
  store[key] = encrypted.toString('base64');
  return { ok: true };
});

ipcMain.handle('secure-store:get', (_event, key: string) => {
  const store =
    (globalThis as unknown as { __ndStore?: Record<string, string> }).__ndStore ?? {};
  const raw = store[key];
  if (!raw || !safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.decryptString(Buffer.from(raw, 'base64'));
});
