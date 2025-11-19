const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const printer = require('node-printer');

const store = new Store();
let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    frame: false,
    show: false,
    backgroundColor: '#ffffff'
  });

  const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
};

// Window controls
ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

// Get system printers
ipcMain.handle('get-printers', async () => {
  try {
    const printers = printer.getPrinters();
    return printers.map(p => ({
      id: p.name,
      name: p.name,
      status: p.status || 'online',
      supportedSizes: ['A4', 'Letter', 'Legal', 'A3'], // Default sizes
      isDefault: p.isDefault || false,
      lastActive: new Date(),
      description: p.description || p.name
    }));
  } catch (error) {
    console.error('Error getting printers:', error);
    throw error;
  }
});

// Print document
ipcMain.handle('print-document', async (event, { printerId, document, options }) => {
  try {
    const printerInstance = new printer(printerId);
    const jobId = await printerInstance.printBuffer(document, options);
    return { success: true, jobId };
  } catch (error) {
    console.error('Error printing document:', error);
    throw error;
  }
});

// Settings
ipcMain.handle('get-settings', () => {
  return store.get('settings');
});

ipcMain.handle('save-settings', (event, settings) => {
  store.set('settings', settings);
  return true;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});