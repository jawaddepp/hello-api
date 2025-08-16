const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Payment = require('../models/Payment');
const Bot = require('../models/Bot');
const UseGatewayService = require('../services/useGatewayService');

const router = express.Router();

const authenticateBot = async (req, res, next) => {
  const botToken = req.headers['x-bot-token'];
  const botName = req.headers['x-bot-name'];

  if (!botToken || !botName) {
    return res.status(401).json({
      success: false,
      error: 'Missing bot authentication headers'
    });
  }

  try {
    const bot = await Bot.findOne({ name: botName }).select('+token +useGateway.apiKey +useGateway.webhookSecret');
    
    if (!bot || bot.token !== botToken || !bot.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Invalid bot credentials or bot is inactive'
      });
    }

    const useGateway = new UseGatewayService(
      bot.useGateway.apiKey,
      bot.useGateway.webhookSecret
    );

    req.bot = {
      name: bot.name,
      allowedCurrencies: bot.allowedCurrencies,
      useGateway
    };

    await Bot.updateOne({ _id: bot._id }, { lastUsedAt: new Date() });
    next();
  } catch (error) {
    console.error('Bot authentication error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// POST /api/payments/create
router.post('/create', authenticateBot, async (req, res) => {
  try {
    const { telegramUserId, currency, amount } = req.body;

    // Validate input
    if (!telegramUserId || !currency || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: telegramUserId, currency, amount'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    // Validate currency is allowed for this bot
    const upperCurrency = currency.toUpperCase();
    if (!req.bot.allowedCurrencies.includes(upperCurrency)) {
      return res.status(400).json({
        success: false,
        error: `Currency ${upperCurrency} is not allowed for this bot. Allowed currencies: ${req.bot.allowedCurrencies.join(', ')}`
      });
    }

    // Generate unique payment ID
    const paymentId = uuidv4();
    
    // Create payment with UseGateway
    const webhookUrl = `${process.env.SERVER_URL}/api/payments/webhook`;

    const gatewayPayment = await req.bot.useGateway.createPayment({
      currency: currency.toUpperCase(),
      amount: amount,
      orderId: paymentId,
      callbackUrl: webhookUrl,
      returnUrl: null // No return URL needed since this is an API
    });

    // Save payment to database
    const payment = new Payment({
      paymentId: paymentId,
      botName: req.headers['x-bot-name'],
      botToken: req.headers['x-bot-token'],
      telegramUserId: telegramUserId,
      currency: currency.toUpperCase(),
      amount: amount,
      amountInCrypto: gatewayPayment.crypto_amount || 0,
      address: gatewayPayment.address,
      paymentUrl: gatewayPayment.payment_url,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    });

    await payment.save();

    // Return only necessary data for the Telegram bot
    res.json({
      success: true,
      data: {
        paymentId: payment.paymentId,
        currency: payment.currency,
        amount: payment.amount,
        amountInCrypto: payment.amountInCrypto,
        address: payment.address,
        expiresAt: payment.expiresAt
      }
    });

  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment'
    });
  }
});

// GET /api/payments/:paymentId
router.get('/:paymentId', authenticateBot, async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findOne({
      paymentId,
      botName: req.headers['x-bot-name'],
      botToken: req.headers['x-bot-token']
    });
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Check if payment is expired
    if (payment.status === 'pending' && new Date() > payment.expiresAt) {
      payment.status = 'expired';
      await payment.save();
    }

    // Get latest status from UseGateway if payment is pending
    if (payment.status === 'pending') {
      try {
        // Get the bot's UseGateway service for this payment
        const bot = await Bot.findOne({ name: payment.botName }).select('+useGateway.apiKey +useGateway.webhookSecret');
        const botGateway = new UseGatewayService(bot.useGateway.apiKey, bot.useGateway.webhookSecret);
        const gatewayStatus = await botGateway.getPaymentStatus(paymentId);
        if (gatewayStatus.status === 'completed' && payment.status !== 'confirmed') {
          payment.status = 'confirmed';
          payment.txHash = gatewayStatus.tx_hash;
          await payment.save();
        }
      } catch (statusError) {
        console.error('Failed to get gateway status:', statusError);
        // Continue with local status if gateway check fails
      }
    }

    // Return simplified response for Telegram bot
    res.json({
      success: true,
      data: {
        paymentId: payment.paymentId,
        status: payment.status,
        txHash: payment.txHash,
        expiresAt: payment.expiresAt
      }
    });

  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment status'
    });
  }
});



// POST /api/payments/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-signature'] || req.headers['x-usegateway-signature'];
    const payload = req.body;

    const webhookData = JSON.parse(payload);
    const { order_id, status, tx_hash } = webhookData;

    // Find the payment to get the associated bot
    const payment = await Payment.findOne({ paymentId: order_id });
    if (!payment) {
      console.error('Payment not found for webhook:', order_id);
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Get the bot's UseGateway service to verify the signature
    const bot = await Bot.findOne({ name: payment.botName }).select('+useGateway.webhookSecret');
    const botGateway = new UseGatewayService(null, bot.useGateway.webhookSecret); // Only need webhook secret for verification

    // Verify webhook signature
    if (!botGateway.verifyWebhookSignature(payload, signature)) {
      console.error('Invalid webhook signature for bot:', payment.botName);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Update payment status
    const oldStatus = payment.status;
    payment.status = status === 'completed' ? 'confirmed' : status;
    payment.txHash = tx_hash || payment.txHash;
    payment.webhookData = webhookData;
    
    await payment.save();

    console.log(`Payment ${order_id} status updated: ${oldStatus} -> ${payment.status}`);

    // Send notification to the specific Telegram bot
    if (payment.status === 'confirmed') {
      try {
        // Construct the bot-specific webhook URL using the bot token
        const webhookUrl = `https://api.telegram.org/bot${payment.botToken}/sendMessage`;
        
        await axios.post(webhookUrl, {
          chat_id: payment.telegramUserId,
          text: `✅ Payment confirmed!\n\nAmount: ${payment.amount} ${payment.currency}\nTransaction: ${payment.txHash}`,
          parse_mode: 'HTML'
        });
        
        console.log(`Payment notification sent to bot ${payment.botName} for user ${payment.telegramUserId}`);
      } catch (notificationError) {
        console.error(`Failed to send notification to bot ${payment.botName}:`, notificationError.message);
      }
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});



module.exports = router;

