require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import routes
const paymentRoutes = require('./routes/payments');
const botRoutes = require('./routes/bots');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crypto_payments';
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
});

// API Routes
app.use('/api/payments', paymentRoutes);
app.use('/api/bots', botRoutes);

// Health check endpoint
app.get('/healthz', (_req, res) => res.send('ok'));

// Database check endpoint
app.get('/ping-db', async (_req, res) => {
  try {
    const state = mongoose.connection.readyState;
    if (state !== 1) return res.status(503).json({ ok: false, state });
    const pong = await mongoose.connection.db.admin().ping();
    return res.json({ ok: true, state, pong });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💫 Environment: ${process.env.NODE_ENV || 'development'}`);
});
