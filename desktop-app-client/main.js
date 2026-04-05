const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');

// ============================================
// CONFIGURATION - MODIFIER L'IP DU SERVEUR ICI
// ============================================
const SERVER_IP = '192.168.0.164';  // <-- Changez cette IP
const SERVER_PORT = 3000;
const SERVER_URL = `http://${SERVER_IP}:${SERVER_PORT}`;
// ============================================

let mainWindow;

// Vérifier si le serveur est accessible
function checkServer() {
    return new Promise((resolve) => {
        const req = http.get(SERVER_URL, (res) => {
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(3000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

// Créer la fenêtre principale
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: 'Allaoua Ceram - Système de Gestion',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        show: false
    });

    // Afficher quand prêt
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
    });

    // Charger l'application depuis le serveur
    mainWindow.loadURL(SERVER_URL);

    // Gérer les erreurs de chargement
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        mainWindow.loadURL(`data:text/html;charset=utf-8,
      <html>
      <head>
        <style>
          body {
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background: linear-gradient(135deg, #1f2937 0%, #991b1b 100%);
            font-family: 'Segoe UI', sans-serif;
            color: white;
          }
          .container { text-align: center; max-width: 500px; padding: 40px; }
          h1 { font-size: 28px; margin-bottom: 20px; }
          .error { background: rgba(239,68,68,0.2); padding: 20px; border-radius: 10px; margin: 20px 0; }
          button { 
            background: #ef4444; color: white; border: none; 
            padding: 15px 30px; font-size: 16px; border-radius: 8px; 
            cursor: pointer; margin-top: 20px;
          }
          button:hover { background: #dc2626; }
          .info { font-size: 14px; opacity: 0.7; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Connexion Impossible</h1>
          <div class="error">
            <p>Impossible de se connecter au serveur:</p>
            <p><strong>${SERVER_URL}</strong></p>
          </div>
          <p>Vérifiez que:</p>
          <ul style="text-align: left;">
            <li>Le serveur ERP est allumé</li>
            <li>Vous êtes sur le même réseau</li>
            <li>L'adresse IP est correcte</li>
          </ul>
          <button onclick="location.reload()">🔄 Réessayer</button>
          <div class="info">
            Contactez l'administrateur si le problème persiste.
          </div>
        </div>
      </body>
      </html>
    `);
    });

    // Ouvrir les liens externes dans le navigateur par défaut
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Écran de chargement
function createLoadingWindow() {
    const loadingWindow = new BrowserWindow({
        width: 400,
        height: 300,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
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
          background: linear-gradient(135deg, #1f2937 0%, #991b1b 100%);
          font-family: 'Segoe UI', sans-serif;
          color: white;
          border-radius: 15px;
        }
        .container { text-align: center; }
        h1 { font-size: 28px; margin-bottom: 10px; color: #fef2f2; }
        .subtitle { font-size: 14px; opacity: 0.8; margin-bottom: 30px; }
        .loader {
          width: 50px; height: 50px;
          border: 4px solid rgba(255,255,255,0.3);
          border-top: 4px solid #ef4444;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .status { font-size: 12px; opacity: 0.7; }
        .server { font-size: 10px; opacity: 0.5; margin-top: 15px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>ALLAOUA CERAM</h1>
        <div class="subtitle">Système de Gestion</div>
        <div class="loader"></div>
        <div class="status">Connexion au serveur...</div>
        <div class="server">${SERVER_URL}</div>
      </div>
    </body>
    </html>
  `);

    return loadingWindow;
}

// Initialisation
app.whenReady().then(async () => {
    const loadingWindow = createLoadingWindow();

    // Vérifier la connexion au serveur
    const serverAvailable = await checkServer();

    // Petit délai pour montrer l'écran de chargement
    await new Promise(r => setTimeout(r, 1500));

    loadingWindow.close();

    if (!serverAvailable) {
        dialog.showErrorBox(
            'Serveur non disponible',
            `Impossible de se connecter au serveur ERP.\n\nAdresse: ${SERVER_URL}\n\nVérifiez que le serveur est allumé et accessible.`
        );
    }

    createWindow();
});

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
