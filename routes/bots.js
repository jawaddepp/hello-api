const express = require('express');
const Bot = require('../models/Bot');
const router = express.Router();

// Middleware to verify admin Telegram ID
const verifyAdminTelegramId = (req, res, next) => {
  const adminTelegramId = req.headers['x-admin-telegram-id'];
  
  if (!adminTelegramId || adminTelegramId !== process.env.ADMIN_TELEGRAM_ID) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Only the admin can manage bots'
    });
  }
  next();
};

// POST /api/bots/register
router.post('/register', verifyAdminTelegramId, async (req, res) => {
  try {
    const { 
      name, 
      token, 
      allowedCurrencies,
      useGateway: {
        apiKey: gatewayApiKey,
        webhookSecret: gatewayWebhookSecret
      } = {}
    } = req.body;

    // Validate input
    if (!name || !token || !gatewayApiKey || !gatewayWebhookSecret) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, token, useGateway.apiKey, useGateway.webhookSecret'
      });
    }

    // Check if bot already exists
    const existingBot = await Bot.findOne({
      $or: [{ name }, { token }]
    });

    if (existingBot) {
      return res.status(409).json({
        success: false,
        error: 'Bot with this name or token already exists'
      });
    }

    // Create new bot
    const bot = new Bot({
      name,
      token,
      allowedCurrencies: allowedCurrencies || ['BTC', 'ETH', 'USDT'],
      registeredBy: req.headers['x-admin-telegram-id'], // Store who registered this bot
      useGateway: {
        apiKey: gatewayApiKey,
        webhookSecret: gatewayWebhookSecret
      }
    });

    await bot.save();

    res.status(201).json({
      success: true,
      data: {
        name: bot.name,
        allowedCurrencies: bot.allowedCurrencies,
        isActive: bot.isActive,
        createdAt: bot.createdAt
      }
    });

  } catch (error) {
    console.error('Bot registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register bot'
    });
  }
});

// GET /api/bots
router.get('/', verifyAdminTelegramId, async (req, res) => {
  try {
    const bots = await Bot.find({}, '-token');

    res.json({
      success: true,
      data: bots
    });

  } catch (error) {
    console.error('Get bots error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bots'
    });
  }
});

// POST /api/bots/:name/deactivate
router.post('/:name/deactivate', verifyAdminTelegramId, async (req, res) => {
  try {
    const { name } = req.params;
    const bot = await Bot.findOne({ name });

    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    bot.isActive = false;
    await bot.save();

    res.json({
      success: true,
      data: {
        name: bot.name,
        isActive: bot.isActive
      }
    });

  } catch (error) {
    console.error('Bot deactivation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate bot'
    });
  }
});

// POST /api/bots/:name/activate
router.post('/:name/activate', verifyAdminTelegramId, async (req, res) => {
  try {
    const { name } = req.params;
    const bot = await Bot.findOne({ name });

    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Bot not found'
      });
    }

    bot.isActive = true;
    await bot.save();

    res.json({
      success: true,
      data: {
        name: bot.name,
        isActive: bot.isActive
      }
    });

  } catch (error) {
    console.error('Bot activation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate bot'
    });
  }
});

module.exports = router;