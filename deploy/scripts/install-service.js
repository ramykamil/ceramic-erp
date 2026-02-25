/**
 * Windows Service Installation Script
 * Uses node-windows to install the backend as a Windows Service
 * 
 * Usage:
 *   node install-service.js install   - Install and start the service
 *   node install-service.js uninstall - Stop and remove the service
 */

const path = require('path');

// Check if node-windows is available
let Service;
try {
    Service = require('node-windows').Service;
} catch (e) {
    console.error('❌ node-windows n\'est pas installé.');
    console.error('   Exécutez: npm install node-windows');
    process.exit(1);
}

// Service configuration
const svc = new Service({
    name: 'CeramicERP-Backend',
    description: 'Ceramic & Tiles ERP System - Backend API Server',
    script: path.join(__dirname, '..', 'backend', 'src', 'server.js'),
    nodeOptions: [],
    workingDirectory: path.join(__dirname, '..', 'backend'),
    env: [
        {
            name: "NODE_ENV",
            value: "production"
        },
        {
            name: "PORT",
            value: "5000"
        }
    ]
});

// Event handlers
svc.on('install', () => {
    console.log('✅ Service CeramicERP-Backend installé');
    console.log('   Démarrage du service...');
    svc.start();
});

svc.on('start', () => {
    console.log('✅ Service CeramicERP-Backend démarré');
    console.log('');
    console.log('   Le serveur est maintenant accessible sur:');
    console.log('   http://localhost:5000/api/v1');
    console.log('');
    console.log('   Le service démarrera automatiquement au prochain redémarrage.');
});

svc.on('stop', () => {
    console.log('🛑 Service CeramicERP-Backend arrêté');
});

svc.on('uninstall', () => {
    console.log('✅ Service CeramicERP-Backend désinstallé');
});

svc.on('error', (err) => {
    console.error('❌ Erreur:', err);
});

// Parse command line arguments
const command = process.argv[2];

switch (command) {
    case 'install':
        console.log('');
        console.log('📦 Installation du service CeramicERP-Backend...');
        console.log('');
        svc.install();
        break;

    case 'uninstall':
        console.log('');
        console.log('🗑️  Désinstallation du service CeramicERP-Backend...');
        console.log('');
        svc.uninstall();
        break;

    case 'start':
        console.log('▶️  Démarrage du service...');
        svc.start();
        break;

    case 'stop':
        console.log('⏹️  Arrêt du service...');
        svc.stop();
        break;

    case 'restart':
        console.log('🔄 Redémarrage du service...');
        svc.stop();
        setTimeout(() => svc.start(), 2000);
        break;

    default:
        console.log('');
        console.log('Ceramic ERP - Gestionnaire de Service Windows');
        console.log('');
        console.log('Usage: node install-service.js <command>');
        console.log('');
        console.log('Commands:');
        console.log('  install    - Installer et démarrer le service');
        console.log('  uninstall  - Arrêter et supprimer le service');
        console.log('  start      - Démarrer le service');
        console.log('  stop       - Arrêter le service');
        console.log('  restart    - Redémarrer le service');
        console.log('');
}
