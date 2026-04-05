require('dotenv').config();
const app = require('./app');
const config = require('./config/config');
const pool = require('./config/database');

const PORT = config.port;
const HOST = '0.0.0.0'; // Bind to all network interfaces for LAN access

// Get local network IP
const getNetworkIP = () => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

// Test database connection before starting server
async function startServer() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✓ Database connection verified');

    // Initialize scheduled tasks (automatic backups, etc.)
    const schedulerService = require('./services/scheduler.service');
    schedulerService.init();

    const networkIP = getNetworkIP();

    // Start server on all interfaces
    const server = app.listen(PORT, HOST, () => {
      console.log('='.repeat(50));
      console.log(`🚀 Ceramic ERP Server running on port ${PORT}`);
      console.log(`📍 Environment: ${config.env}`);
      console.log(`🌐 Local URL: http://localhost:${PORT}/api/v1`);
      console.log(`📱 Network URL: http://${networkIP}:${PORT}/api/v1`);
      console.log('='.repeat(50));
    });

    // Increase timeout for large CSV imports (5 minutes)
    server.timeout = 300000;
    server.keepAliveTimeout = 300000;
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT signal received: closing HTTP server');
  await pool.end();
  process.exit(0);
});

startServer();

