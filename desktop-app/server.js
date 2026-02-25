/**
 * Embedded Server Module
 * Starts Express backend and Next.js frontend in the same process
 */
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const PROJECT_DIR = path.join(__dirname, '..');
const BACKEND_PORT = 5000;
const FRONTEND_PORT = 3000;

let backendProcess = null;
let frontendProcess = null;

/**
 * Load branding configuration
 */
function loadBranding() {
    const brandingPath = path.join(PROJECT_DIR, 'config', 'branding.json');
    try {
        if (fs.existsSync(brandingPath)) {
            return JSON.parse(fs.readFileSync(brandingPath, 'utf8'));
        }
    } catch (err) {
        console.error('Error loading branding config:', err);
    }

    // Default branding
    return {
        companyName: 'Retail ERP',
        windowTitle: 'Retail ERP - Système de Gestion',
        loadingMessage: 'Démarrage de l\'application...'
    };
}

/**
 * Check if a port is responding
 */
function checkPort(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}`, (res) => {
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

/**
 * Wait for a port to become available
 */
async function waitForPort(port, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
        const available = await checkPort(port);
        if (available) return true;
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

/**
 * Start the backend server
 */
function startBackend(useSQLite = true) {
    return new Promise((resolve, reject) => {
        console.log('Starting backend server...');

        const env = {
            ...process.env,
            PORT: BACKEND_PORT,
            NODE_ENV: 'production'
        };

        // Use SQLite for portable mode
        if (useSQLite) {
            env.DB_TYPE = 'sqlite';
            env.SQLITE_DATA_DIR = path.join(PROJECT_DIR, 'data');
        }

        backendProcess = spawn('node', ['src/server.js'], {
            cwd: path.join(PROJECT_DIR, 'backend'),
            env,
            stdio: 'pipe'
        });

        backendProcess.stdout.on('data', (data) => {
            console.log(`Backend: ${data}`);
            if (data.toString().includes('Server running') || data.toString().includes('listening')) {
                resolve();
            }
        });

        backendProcess.stderr.on('data', (data) => {
            console.error(`Backend Error: ${data}`);
        });

        backendProcess.on('error', reject);

        // Timeout after 15 seconds
        setTimeout(resolve, 15000);
    });
}

/**
 * Start the frontend server
 */
function startFrontend() {
    return new Promise((resolve, reject) => {
        console.log('Starting frontend server...');

        const env = {
            ...process.env,
            PORT: FRONTEND_PORT,
            NODE_ENV: 'production'
        };

        // Check if we should use npm start (production) or npm run dev
        const useProduction = fs.existsSync(path.join(PROJECT_DIR, 'frontend', '.next'));
        const command = useProduction ? 'start' : 'dev';

        frontendProcess = spawn('npm', ['run', command], {
            cwd: path.join(PROJECT_DIR, 'frontend'),
            shell: true,
            env,
            stdio: 'pipe'
        });

        frontendProcess.stdout.on('data', (data) => {
            console.log(`Frontend: ${data}`);
            if (data.toString().includes('Ready') || data.toString().includes('started')) {
                resolve();
            }
        });

        frontendProcess.stderr.on('data', (data) => {
            console.error(`Frontend Error: ${data}`);
        });

        frontendProcess.on('error', reject);

        // Timeout after 30 seconds
        setTimeout(resolve, 30000);
    });
}

/**
 * Start the embedded server (backend + frontend)
 */
async function startEmbeddedServer(options = {}) {
    const { useSQLite = true } = options;

    // Check if services are already running
    const backendRunning = await checkPort(BACKEND_PORT);
    const frontendRunning = await checkPort(FRONTEND_PORT);

    if (!backendRunning) {
        await startBackend(useSQLite);
        await waitForPort(BACKEND_PORT, 30);
    } else {
        console.log('Backend already running');
    }

    if (!frontendRunning) {
        await startFrontend();
        await waitForPort(FRONTEND_PORT, 60);
    } else {
        console.log('Frontend already running');
    }

    return {
        backendUrl: `http://localhost:${BACKEND_PORT}`,
        frontendUrl: `http://localhost:${FRONTEND_PORT}`
    };
}

/**
 * Stop all server processes
 */
function stopServers() {
    if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
        console.log('Backend stopped');
    }

    if (frontendProcess) {
        frontendProcess.kill();
        frontendProcess = null;
        console.log('Frontend stopped');
    }
}

/**
 * Check server health
 */
async function checkHealth() {
    const backend = await checkPort(BACKEND_PORT);
    const frontend = await checkPort(FRONTEND_PORT);

    return {
        backend,
        frontend,
        healthy: backend && frontend
    };
}

module.exports = {
    loadBranding,
    startBackend,
    startFrontend,
    startEmbeddedServer,
    stopServers,
    checkPort,
    waitForPort,
    checkHealth,
    BACKEND_PORT,
    FRONTEND_PORT
};
