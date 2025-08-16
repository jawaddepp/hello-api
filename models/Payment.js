const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    required: true
  },
  botName: {
    type: String,
    required: true,
    index: true
  },

  telegramUserId: {
    type: String,
    required: true
  },
  currency: {
    type: String,
    required: true,
    enum: ['BTC', 'ETH', 'USDT', 'LTC', 'BCH', 'XRP', 'ADA', 'DOT', 'MATIC']
  },
  amount: {
    type: Number,
    required: true
  },
  amountInCrypto: {
    type: Number,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  paymentUrl: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'expired'],
    default: 'pending'
  },
  txHash: {
    type: String,
    default: null
  },
  webhookData: {
    type: Object,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
paymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
paymentSchema.index({ paymentId: 1 });
paymentSchema.index({ botName: 1, telegramUserId: 1, status: 1 });

paymentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Payment', paymentSchema);

