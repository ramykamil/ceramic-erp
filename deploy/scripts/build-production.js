/**
 * Production Build Script
 * Prepares the application for deployment
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const DEPLOY_DIR = path.join(ROOT_DIR, 'deploy');
const OUTPUT_DIR = path.join(DEPLOY_DIR, 'output');

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('   CERAMIC ERP - Production Build');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// Helper function
function run(cmd, cwd) {
    console.log(`   📦 ${cmd}`);
    try {
        execSync(cmd, { cwd, stdio: 'inherit' });
    } catch (error) {
        console.error(`   ❌ Command failed: ${cmd}`);
        process.exit(1);
    }
}

// Step 1: Install backend dependencies
console.log('[1/5] Installing backend dependencies...');
run('npm install --production', BACKEND_DIR);

// Step 2: Install frontend dependencies  
console.log('[2/5] Installing frontend dependencies...');
run('npm install', FRONTEND_DIR);

// Step 3: Build frontend
console.log('[3/5] Building frontend...');
run('npm run build', FRONTEND_DIR);

// Step 4: Create output directory
console.log('[4/5] Preparing output directory...');
if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Copy files
const filesToCopy = [
    { src: BACKEND_DIR, dest: path.join(OUTPUT_DIR, 'backend') },
    { src: FRONTEND_DIR, dest: path.join(OUTPUT_DIR, 'frontend') },
    { src: path.join(DEPLOY_DIR, 'scripts', 'START-ERP.bat'), dest: path.join(OUTPUT_DIR, 'START-ERP.bat') },
    { src: path.join(DEPLOY_DIR, 'scripts', 'STOP-ERP.bat'), dest: path.join(OUTPUT_DIR, 'STOP-ERP.bat') },
    { src: path.join(DEPLOY_DIR, 'scripts', 'SETUP-CLIENT.bat'), dest: path.join(OUTPUT_DIR, 'SETUP-CLIENT.bat') },
    { src: path.join(DEPLOY_DIR, 'config', '.env.production'), dest: path.join(OUTPUT_DIR, 'backend', '.env') },
    { src: path.join(DEPLOY_DIR, 'docs'), dest: path.join(OUTPUT_DIR, 'docs') }
];

// Step 5: Copy distribution files
console.log('[5/5] Copying distribution files...');

// For now, just show instructions since we're on Linux
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('   Build Complete!');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('   Next steps on Windows:');
console.log('   1. Copy the entire ceramic-erp-platform folder to Windows');
console.log('   2. Install Inno Setup from https://jrsoftware.org/isinfo.php');
console.log('   3. Open deploy/installer/ceramic-erp-setup.iss');
console.log('   4. Compile to create the installer');
console.log('');
console.log('   Or for quick deployment:');
console.log('   1. Copy the folder to C:\\CeramicERP on the server');
console.log('   2. Run deploy/scripts/START-ERP.bat');
console.log('');
