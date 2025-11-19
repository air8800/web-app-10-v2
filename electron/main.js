const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const printer = require('printer');

const store = new Store();

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: false,
    show: false,
    backgroundColor: '#ffffff'
  });

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
};

// Handle window controls
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

// IPC handlers for printer operations
ipcMain.handle('get-printers', async () => {
  try {
    const printerList = printer.getPrinters();
    return printerList.map(p => ({
      id: p.name,
      name: p.name,
      status: p.status || 'online',
      supportedSizes: ['A4', 'Letter'], // Default sizes since the printer package doesn't provide media info
      isDefault: p.isDefault || false,
      lastActive: new Date(),
      description: p.description || `${p.name} (System Printer)`
    }));
  } catch (error) {
    console.error('Error getting printers:', error);
    throw error;
  }
});

ipcMain.handle('print-document', async (event, { printerId, document, options }) => {
  try {
    printer.printDirect({
      data: document,
      printer: printerId,
      type: 'RAW',
      success: (jobID) => {
        console.log(`Printed with job ID: ${jobID}`);
        return { success: true, jobId: jobID };
      },
      error: (err) => {
        console.error('Print error:', err);
        throw err;
      }
    });
  } catch (error) {
    console.error('Error printing document:', error);
    throw error;
  }
});

ipcMain.handle('get-settings', () => {
  return store.get('settings');
});

ipcMain.handle('save-settings', (event, settings) => {
  store.set('settings', settings);
  return true;
});