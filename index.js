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

// Trust proxy - required for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
});

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
.then(async () => {
  console.log('✅ MongoDB connected');
  
  // Remove TTL index to prevent payment deletion
  try {
    const db = mongoose.connection.db;
    const paymentsCollection = db.collection('payments');
    
    // List all indexes
    const indexes = await paymentsCollection.indexes();
    console.log('Current payment indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key, expireAfterSeconds: idx.expireAfterSeconds })));
    
    // Find and drop the TTL index
    const ttlIndex = indexes.find(index => 
      index.key && index.key.expiresAt && index.expireAfterSeconds !== undefined
    );

    if (ttlIndex) {
      console.log('Found TTL index:', ttlIndex.name);
      await paymentsCollection.dropIndex(ttlIndex.name);
      console.log('✅ TTL index dropped - payments will no longer be auto-deleted');
    } else {
      console.log('✅ No TTL index found - payments are safe');
    }
  } catch (error) {
    console.error('⚠️ Could not remove TTL index:', error.message);
  }
})
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
