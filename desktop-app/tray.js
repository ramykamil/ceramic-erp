/**
 * System Tray Module
 * Shows server status and LAN IP in system tray
 */
const { Tray, Menu, nativeImage, clipboard, shell } = require('electron');
const path = require('path');
const { getLocalIP, getServerURL } = require('./utils/network');

let tray = null;

/**
 * Create the system tray icon and menu
 */
function createTray(options = {}) {
    const {
        mainWindow = null,
        port = 3000,
        branding = {}
    } = options;

    // Load tray icon
    const iconPath = path.join(__dirname, 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);

    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const localIP = getLocalIP();
    const serverUrl = getServerURL(port);
    const appName = branding.shortName || branding.companyName || 'Retail ERP';

    // Update tooltip
    tray.setToolTip(`${appName}\nAccès réseau: ${serverUrl}`);

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
        {
            label: `📡 ${appName}`,
            enabled: false
        },
        { type: 'separator' },
        {
            label: `🌐 Adresse: ${serverUrl}`,
            click: () => {
                shell.openExternal(serverUrl);
            }
        },
        {
            label: '📋 Copier l\'adresse',
            click: () => {
                clipboard.writeText(serverUrl);
            }
        },
        { type: 'separator' },
        {
            label: '📱 Appareils peuvent accéder via:',
            enabled: false
        },
        {
            label: `   ${serverUrl}`,
            enabled: false
        },
        { type: 'separator' },
        {
            label: '🖥️ Ouvrir l\'application',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        {
            label: '🔄 Actualiser',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.reload();
                }
            }
        },
        { type: 'separator' },
        {
            label: '❌ Quitter',
            role: 'quit'
        }
    ]);

    tray.setContextMenu(contextMenu);

    // Double-click to open window
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    console.log(`System tray created. LAN access: ${serverUrl}`);

    return tray;
}

/**
 * Update tray status (e.g., when server status changes)
 */
function updateTrayStatus(status) {
    if (tray) {
        const statusText = status === 'running' ? '🟢' : '🔴';
        tray.setToolTip(`${statusText} Retail ERP - ${status}`);
    }
}

/**
 * Destroy the tray
 */
function destroyTray() {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}

module.exports = {
    createTray,
    updateTrayStatus,
    destroyTray
};
