const express = require('express');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const Payment = require('../models/Payment');
const Bot = require('../models/Bot');
const UseGatewayService = require('../services/useGatewayService');

const router = express.Router();

const authenticateBot = async (req, res, next) => {
  const botToken = req.headers['x-bot-token'];

  if (!botToken) {
    return res.status(401).json({
      success: false,
      error: 'Missing bot token header'
    });
  }

  try {
    const bot = await Bot.findOne({ token: botToken }).select('+token +useGateway.apiKey +useGateway.webhookSecret');
    
    if (!bot || !bot.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Invalid bot token or bot is inactive'
      });
    }

    const useGateway = new UseGatewayService(
      bot.useGateway.apiKey,
      bot.useGateway.webhookSecret
    );

    req.bot = {
      name: bot.name,
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
    console.log('Payment creation request:', req.body);
    const { telegramUserId, currency, amount } = req.body;

    if (!telegramUserId || !currency || !amount) {
      console.log('Missing fields:', { telegramUserId, currency, amount });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: telegramUserId, currency, amount'
      });
    }

    if (amount <= 0) {
      console.log('Invalid amount:', amount);
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

                const upperCurrency = currency.toUpperCase();

    const paymentId = uuidv4();
    
    if (!process.env.SERVER_URL) {
      console.error('SERVER_URL environment variable is not set');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
        details: 'Webhook URL is not configured'
      });
    }

    const webhookUrl = `${process.env.SERVER_URL}/api/payments/webhook`;
    
    console.log('Creating UseGateway payment:', {
      currency: upperCurrency,
      amount,
      orderId: paymentId,
      callbackUrl: webhookUrl,
      serverUrl: process.env.SERVER_URL
    });

    try {
      const gatewayPayment = await req.bot.useGateway.createPayment({
        currency: upperCurrency,
        amount: amount,
        orderId: paymentId,
        callbackUrl: webhookUrl,
        returnUrl: null
      });

      console.log('UseGateway payment created:', gatewayPayment);

      // Validate UseGateway response based on their API docs
      if (!gatewayPayment.hosted_url) {
        console.error('UseGateway response missing hosted_url:', gatewayPayment);
        return res.status(500).json({
          success: false,
          error: 'UseGateway did not return payment URL',
          details: 'Missing hosted_url field in UseGateway response'
        });
      }

      // Get the correct address based on currency
                    let cryptoAddress = 'pending';
              if (gatewayPayment.addresses) {
                if (gatewayPayment.addresses[upperCurrency]) {
                  cryptoAddress = gatewayPayment.addresses[upperCurrency];
                } else {
                  cryptoAddress = Object.values(gatewayPayment.addresses)[0] || 'pending';
                }
              }

                    const payment = new Payment({
                paymentId: paymentId,
                gatewayPaymentId: gatewayPayment.id,
                botToken: req.headers['x-bot-token'],
                telegramUserId: telegramUserId,
                currency: upperCurrency,
                amount: amount,
                amountInCrypto: gatewayPayment.pricing?.[upperCurrency.toLowerCase()]?.amount || 0,
                address: cryptoAddress,
                paymentUrl: gatewayPayment.hosted_url,
                status: 'pending',
                expiresAt: new Date(Date.now() + 30 * 60 * 1000)
              });

              await payment.save();
              console.log('Payment saved to database:', payment);

              return res.json({
                success: true,
                data: {
                  paymentId: payment.paymentId,
                  gatewayPaymentId: payment.gatewayPaymentId,
                  currency: payment.currency,
                  amount: payment.amount,
                  amountInCrypto: payment.amountInCrypto,
                  address: payment.address,
                  expiresAt: payment.expiresAt,
                  useGatewayResponse: gatewayPayment
                }
              });

    } catch (gatewayError) {
      console.error('UseGateway API error:', {
        error: gatewayError.message,
        response: gatewayError.response?.data,
        status: gatewayError.response?.status
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to create payment with gateway',
        details: gatewayError.response?.data?.message || gatewayError.message
      });
    }

  } catch (error) {
    console.error('Payment creation error:', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create payment',
      details: error.message
    });
  }
});

// GET /api/payments/:paymentId
router.get('/:paymentId', authenticateBot, async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findOne({ 
      $and: [
        { 
          $or: [
            { paymentId: paymentId },
            { gatewayPaymentId: paymentId }
          ]
        },
        { botToken: req.headers['x-bot-token'] }
      ]
    }).select('+botToken');
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
        const bot = await Bot.findOne({ token: payment.botToken }).select('+useGateway.apiKey +useGateway.webhookSecret');
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
        gatewayPaymentId: payment.gatewayPaymentId,
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
router.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook headers received:', Object.keys(req.headers));
    const signature = req.headers['x-signature'] || req.headers['x-usegateway-signature'] || req.headers['signature'] || req.headers['svix-signature'];
    
    // Handle both raw and parsed JSON
    let webhookData;
    let payload;
    
    if (typeof req.body === 'string') {
      payload = req.body;
      webhookData = JSON.parse(payload);
    } else if (typeof req.body === 'object') {
      webhookData = req.body;
      payload = JSON.stringify(req.body);
    } else {
      console.error('Invalid webhook payload type:', typeof req.body);
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    console.log('Webhook data received:', JSON.stringify(webhookData, null, 2));
    
    // Extract order_id from UseGateway webhook format
    // Try multiple possible locations for the payment ID
    const order_id = webhookData.data?.metadata?.order_id || 
                     webhookData.data?.id ||
                     webhookData.data?.metadata?.payment_id;
    const status = webhookData.data?.confirmed_at ? 'completed' : 'pending';
    
    console.log('Extracted order_id:', order_id);
    console.log('Webhook event type:', webhookData.event);
    
    // Try multiple possible paths for transaction hash
    let tx_hash = null;
    if (webhookData.data?.transactions && webhookData.data.transactions.length > 0) {
      tx_hash = webhookData.data.transactions[0]?.hash || 
                webhookData.data.transactions[0]?.transaction_hash ||
                webhookData.data.transactions[0]?.txid ||
                webhookData.data.transactions[0]?.tx_hash;
    }
    
    // Alternative paths for tx hash
    tx_hash = tx_hash || 
              webhookData.data?.transaction_hash ||
              webhookData.data?.tx_hash ||
              webhookData.data?.txid ||
              webhookData.transaction_hash ||
              webhookData.tx_hash;
              
    console.log('Extracted transaction hash:', tx_hash);

    // Find the payment to get the associated bot
    const payment = await Payment.findOne({ 
      $or: [
        { paymentId: order_id },
        { gatewayPaymentId: order_id }
      ]
    }).select('+botToken');
    if (!payment) {
      console.error('Payment not found for webhook:', order_id);
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Get the bot's UseGateway service to verify the signature
    const bot = await Bot.findOne({ token: payment.botToken }).select('+useGateway.webhookSecret +token');
    const botGateway = new UseGatewayService(null, bot.useGateway.webhookSecret); // Only need webhook secret for verification

    // Verify webhook signature
    console.log('Signature found:', signature ? 'Yes' : 'No');
    console.log('Signature value:', signature);
    console.log('Payload length:', payload ? payload.length : 'undefined');
    
    if (signature) {
      if (!botGateway.verifyWebhookSignature(payload, signature)) {
        console.error('Invalid webhook signature for bot token:', payment.botToken);
        return res.status(401).json({ error: 'Invalid signature' });
      }
      console.log('Webhook signature verified successfully');
    } else {
      console.warn('No webhook signature provided - accepting webhook (this may be insecure in production)');
    }

    // Update payment status
    const oldStatus = payment.status;
    payment.status = status === 'completed' ? 'confirmed' : status;
    payment.txHash = tx_hash || payment.txHash;
    payment.webhookData = webhookData;
    
    await payment.save();

    console.log(`Payment ${order_id} status updated: ${oldStatus} -> ${payment.status}`);

    if (payment.status === 'confirmed') {
      try {
        const webhookUrl = `https://api.telegram.org/bot${bot.token}/sendMessage`;
        const transactionText = payment.txHash ? 
          `رقم العملية: ${payment.txHash}` : 
          `رقم العملية: تم التأكيد (في انتظار الرقم)`;
          
        await axios.post(webhookUrl, {
          chat_id: payment.telegramUserId,
          text: `✅ تم تأكيد الدفع!\n\nالعملة: ${payment.currency}\nالمبلغ: ${payment.amount}\n${transactionText}`,
          parse_mode: 'HTML'
        });
        
        console.log(`Payment notification sent to bot for user ${payment.telegramUserId}`);
      } catch (notificationError) {
        console.error(`Failed to send notification to bot:`, notificationError.message);
      }
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});



module.exports = router;

