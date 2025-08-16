const mongoose = require('mongoose');

const botSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  registeredBy: {
    type: String,
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    select: false
  },
  useGateway: {
    apiKey: {
      type: String,
      required: true,
      select: false
    },
    webhookSecret: {
      type: String,
      required: true,
      select: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  },
  allowedCurrencies: {
    type: [String],
    default: ['BTC', 'ETH', 'USDT']
  }
});

// Index for efficient queries
botSchema.index({ name: 1 });
botSchema.index({ token: 1 });

module.exports = mongoose.model('Bot', botSchema);
