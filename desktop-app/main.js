/**
 * Retail ERP - Electron Main Process
 * Portable desktop application with embedded server
 */
const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { startEmbeddedServer, stopServers, loadBranding, FRONTEND_PORT } = require('./server');
const { createTray, destroyTray } = require('./tray');
const { getLocalIP, getServerURL } = require('./utils/network');

let mainWindow;
let loadingWindow;
let tray;

const PROJECT_DIR = path.join(__dirname, '..');

// Load branding configuration
const branding = loadBranding();

/**
 * Create the loading splash screen
 */
function createLoadingWindow() {
    const primaryColor = branding.primaryColor || '#2563eb';
    const secondaryColor = branding.secondaryColor || '#1e40af';
    const companyName = branding.companyName || 'Retail ERP';
    const loadingMessage = branding.loadingMessage || 'Démarrage de l\'application...';

    loadingWindow = new BrowserWindow({
        width: 400,
        height: 300,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    loadingWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
    <head>
      <style>
        body {
          margin: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background: linear-gradient(135deg, ${secondaryColor} 0%, ${primaryColor} 100%);
          font-family: 'Segoe UI', sans-serif;
          color: white;
          border-radius: 15px;
        }
        .container {
          text-align: center;
        }
        h1 {
          font-size: 28px;
          margin-bottom: 10px;
        }
        .subtitle {
          font-size: 14px;
          opacity: 0.8;
          margin-bottom: 30px;
        }
        .loader {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255,255,255,0.3);
          border-top: 4px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .status {
          font-size: 12px;
          opacity: 0.7;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${companyName.toUpperCase()}</h1>
        <div class="subtitle">Système de Gestion</div>
        <div class="loader"></div>
        <div class="status">${loadingMessage}</div>
      </div>
    </body>
    </html>
  `);

    return loadingWindow;
}

/**
 * Create the main application window
 */
function createMainWindow() {
    const windowTitle = branding.windowTitle || 'Retail ERP - Système de Gestion';

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: windowTitle,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        show: false
    });

    // Show when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
    });

    // Load the frontend
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);

    // Open external links in default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Minimize to tray instead of closing
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    return mainWindow;
}

/**
 * Application initialization
 */
app.whenReady().then(async () => {
    // Show loading screen
    createLoadingWindow();

    try {
        console.log('Starting embedded server...');

        // Start the embedded server with SQLite
        await startEmbeddedServer({ useSQLite: true });

        console.log('Server started successfully');

        // Close loading window
        if (loadingWindow) {
            loadingWindow.close();
            loadingWindow = null;
        }

        // Create main window
        createMainWindow();

        // Create system tray
        tray = createTray({
            mainWindow,
            port: FRONTEND_PORT,
            branding
        });

        // Log LAN access info
        const serverUrl = getServerURL(FRONTEND_PORT);
        console.log(`\n${'='.repeat(50)}`);
        console.log(`  ${branding.companyName || 'Retail ERP'} is running!`);
        console.log(`  Local:   http://localhost:${FRONTEND_PORT}`);
        console.log(`  Network: ${serverUrl}`);
        console.log(`${'='.repeat(50)}\n`);

    } catch (error) {
        console.error('Startup error:', error);

        if (loadingWindow) {
            loadingWindow.close();
        }

        dialog.showErrorBox(
            'Erreur de démarrage',
            `Impossible de démarrer l'application.\n\nErreur: ${error.message}\n\nVérifiez que tous les fichiers sont présents et que les ports 3000 et 5000 sont disponibles.`
        );

        app.quit();
    }
});

// Handle app quit
app.on('before-quit', () => {
    app.isQuitting = true;
    stopServers();
    destroyTray();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createMainWindow();
    } else {
        mainWindow.show();
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    dialog.showErrorBox('Erreur', error.message);
});
