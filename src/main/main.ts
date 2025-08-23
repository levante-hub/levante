import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: join(__dirname, '../../resources/icons/icon.png'), // App icon
    titleBarStyle: process.platform === 'darwin' ? 'default' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false, // Required for some native modules
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  // Load the app
  if (process.env.NODE_ENV === 'development' && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Show window when ready to prevent visual flash
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    
    if (process.env.NODE_ENV === 'development') {
      mainWindow?.webContents.openDevTools()
    }
  })

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Security: Handle external links
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

// App event handlers
app.whenReady().then(() => {
  // Set app user model id for windows
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.levante.app')
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// IPC handlers for secure communication
ipcMain.handle('levante/app/version', () => {
  return app.getVersion()
})

ipcMain.handle('levante/app/platform', () => {
  return process.platform
})

// Placeholder for chat functionality
ipcMain.handle('levante/chat/send', async (event, message: string) => {
  // This will be implemented with AI SDK integration
  return { 
    success: true, 
    response: `Echo: ${message}` 
  }
})

// In development, enable hot reload
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reload')(__dirname, {
      electron: join(__dirname, '../../node_modules/.bin/electron'),
      hardResetMethod: 'exit'
    })
  } catch (e) {
    // electron-reload not available, that's ok
  }
}