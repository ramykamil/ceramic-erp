/**
 * Production Server Configuration
 * This server serves both the API and the frontend build
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import middleware
const { errorHandler, notFoundHandler } = require('./api/v1/middleware/error.middleware');

// Import routes
const apiRoutes = require('./api/v1/routes');

// Create Express app
const app = express();

// Configuration
const config = require('./config/config');
const pool = require('./config/database');
const PORT = config.port || 5000;
const FRONTEND_PORT = process.env.FRONTEND_PORT || 3000;
const HOST = '0.0.0.0';

// Get local network IP
const getNetworkIP = () => {
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

// ============================================
// MIDDLEWARE SETUP
// ============================================

// CORS - Allow all origins for LAN access
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files from uploads directory
app.use('/uploads', express.static(uploadsDir));

// Request logging (production minimal)
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
        next();
    });
}

// ============================================
// API ROUTES
// ============================================
app.use('/api/v1', apiRoutes);

// ============================================
// FRONTEND SERVING (Production Mode)
// ============================================
const frontendBuildPath = path.join(__dirname, '../../frontend/.next');
const frontendStaticPath = path.join(__dirname, '../../frontend/public');
const frontendOutPath = path.join(__dirname, '../../frontend/out');

// Check if frontend build exists (for static export)
if (fs.existsSync(frontendOutPath)) {
    console.log('📦 Serving static frontend from /frontend/out');
    app.use(express.static(frontendOutPath));

    // SPA fallback - serve index.html for all non-API routes
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) {
            return next();
        }
        res.sendFile(path.join(frontendOutPath, 'index.html'));
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Ceramic ERP Server is running',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        network: getNetworkIP()
    });
});

// 404 Handler for API
app.use('/api', notFoundHandler);

// Error Handler
app.use(errorHandler);

// ============================================
// SERVER START
// ============================================
async function startServer() {
    try {
        // Test database connection
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection verified');

        const networkIP = getNetworkIP();

        // Start server
        const server = app.listen(PORT, HOST, () => {
            console.log('');
            console.log('═'.repeat(60));
            console.log('   🏭 CERAMIC ERP - PRODUCTION SERVER');
            console.log('═'.repeat(60));
            console.log(`   📍 Environment: ${config.env || 'production'}`);
            console.log(`   🖥️  Local API:   http://localhost:${PORT}/api/v1`);
            console.log(`   🌐 Network API: http://${networkIP}:${PORT}/api/v1`);
            console.log('');
            console.log(`   🖥️  Local App:   http://localhost:${FRONTEND_PORT}`);
            console.log(`   🌐 Network App: http://${networkIP}:${FRONTEND_PORT}`);
            console.log('═'.repeat(60));
            console.log('');
            console.log('   Press Ctrl+C to stop the server');
            console.log('');
        });

        // Increase timeout for large operations
        server.timeout = 300000;
        server.keepAliveTimeout = 300000;

    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        console.error('');
        console.error('   Please check:');
        console.error('   1. PostgreSQL is running');
        console.error('   2. Database credentials are correct in .env');
        console.error('');
        process.exit(1);
    }
}

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
    console.log('\n🛑 Server shutting down...');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Server shutting down...');
    await pool.end();
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

// Start the server
startServer();
