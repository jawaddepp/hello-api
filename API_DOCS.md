# Crypto Payment Gateway API Documentation

## Initial Setup

1. Set environment variables in `.env`:
```
ADMIN_TELEGRAM_ID=your_telegram_id
MONGODB_URI=your_mongodb_uri
SERVER_URL=your_server_url
```

## Bot Management

### 1. Register a New Bot

```http
POST /api/bots/register
Headers:
  x-admin-telegram-id: YOUR_TELEGRAM_ID
Body:
{
  "name": "my_bot_name",
  "token": "bot_telegram_token",
  "useGateway": {
    "apiKey": "your_usegateway_api_key",
    "webhookSecret": "your_usegateway_webhook_secret"
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "name": "my_bot_name",
    "isActive": true,
    "createdAt": "2024-03-20T12:00:00.000Z"
  }
}
```

### 2. List All Bots

```http
GET /api/bots
Headers:
  x-admin-telegram-id: YOUR_TELEGRAM_ID
```

### 3. Deactivate/Activate Bot

```http
POST /api/bots/{botName}/deactivate
Headers:
  x-admin-telegram-id: YOUR_TELEGRAM_ID
```

```http
POST /api/bots/{botName}/activate
Headers:
  x-admin-telegram-id: YOUR_TELEGRAM_ID
```

## Payment Operations

**Note:** All payment operations only require the bot token. Bot name is only used during registration.

### 1. Create Payment

```http
POST /api/payments/create
Headers:
  x-bot-token: BOT_TELEGRAM_TOKEN
Body:
{
  "telegramUserId": "user_telegram_id",
  "currency": "USDT_TRC20",
  "amount": 1
}
```

**Supported Currencies:**
- Any currency supported by UseGateway.net
- Examples: `BTC`, `ETH`, `LTC`, `USDT_TRC20`, `USDT_ERC20`, `USDT_BEP20`, `USDC_ERC20`, `USDC_BEP20`, etc.
- No restrictions - bots can use any available cryptocurrency

Response:
```json
{
  "success": true,
  "data": {
    "paymentId": "unique_payment_id",
    "currency": "USDT",
    "amount": 1,
    "amountInCrypto": 0.0034,
    "address": "crypto_address",
    "expiresAt": "2024-03-20T12:30:00.000Z"
  }
}
```

### 2. Check Payment Status

```http
GET /api/payments/{paymentId}
Headers:
  x-bot-token: BOT_TELEGRAM_TOKEN
```

Response:
```json
{
  "success": true,
  "data": {
    "paymentId": "unique_payment_id",
    "status": "pending|confirmed|expired",
    "txHash": "transaction_hash",
    "expiresAt": "2024-03-20T12:30:00.000Z"
  }
}
```

### 3. Payment Webhook

The system automatically handles UseGateway.net webhooks at:
```
POST /api/payments/webhook
```

When payment is confirmed, the system will automatically send a message to the user through your Telegram bot.

## Step by Step Integration Guide

### 1. Setup Bot with UseGateway.net
- Create account on UseGateway.net
- Get API key and webhook secret
- Set webhook URL to: `{YOUR_SERVER_URL}/api/payments/webhook`

### 2. Register Your Bot
- Use the register endpoint with your Telegram ID as admin
- Include your bot's name and Telegram token
- Include UseGateway credentials
- **Save only the bot token** for future API requests

### 3. Create Payment Flow
- When user requests payment in your bot:
  1. Call create payment endpoint with **only your bot token**
  2. Send payment address to user
  3. Start checking payment status
  4. Wait for webhook confirmation

### 4. Handle Payment Updates
- System automatically processes webhooks
- Your bot will receive confirmation message
- Update your bot's UI accordingly

## Authentication

- **Bot Registration**: Requires admin Telegram ID
- **Payment Operations**: Only requires bot token (`x-bot-token` header)
- **Bot Management**: Requires admin Telegram ID

## Example Bot Integration

```javascript
// Create payment
const response = await axios.post('YOUR_SERVER_URL/api/payments/create', {
  telegramUserId: user.id,
  currency: 'USDT',
  amount: 10
}, {
  headers: {
    'x-bot-token': process.env.BOT_TOKEN,
    'Content-Type': 'application/json'
  }
});

// Check payment status
const status = await axios.get(`YOUR_SERVER_URL/api/payments/${paymentId}`, {
  headers: {
    'x-bot-token': process.env.BOT_TOKEN
  }
});
```

## Error Handling

Common error responses:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details"
}
```

Status codes:
- 400: Invalid input or currency not allowed
- 401: Authentication failed (invalid or missing bot token)
- 404: Resource not found
- 500: Server error or UseGateway API error

## Security Notes

- Keep bot tokens secure - they are the only authentication needed
- Use HTTPS in production
- Bot tokens are never returned in API responses
- Each bot has its own UseGateway credentials
- Webhook signatures are verified per bot
- Monitor bot activity through logs
- Bot tokens must be unique across all registered bots