const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import middleware
const { errorHandler, notFoundHandler } = require('./api/v1/middleware/error.middleware');

// Import routes
const apiRoutes = require('./api/v1/routes');

// Create Express app
const app = express();

// Middleware - CORS configured for LAN and Cloud access
// Allow specific frontend URL in production, or fallback to '*'
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false // Must be false if origin is '*'
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files from uploads directory
app.use('/uploads', express.static(uploadsDir));

// Request logging middleware (development)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// API Routes
app.use('/api/v1', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Ceramic & Tiles ERP API',
    version: '1.0.0',
    documentation: '/api/v1/health'
  });
});

// 404 Handler
app.use(notFoundHandler);

// Error Handler
app.use(errorHandler);

module.exports = app;

