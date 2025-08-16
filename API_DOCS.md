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
  "allowedCurrencies": ["BTC", "ETH", "USDT"],
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
    "allowedCurrencies": ["BTC", "ETH", "USDT"],
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

### 1. Create Payment

```http
POST /api/payments/create
Headers:
  x-bot-token: BOT_TELEGRAM_TOKEN
Body:
{
  "telegramUserId": "user_telegram_id",
  "currency": "BTC",
  "amount": 100
}
```

Response:
```json
{
  "success": true,
  "data": {
    "paymentId": "unique_payment_id",
    "currency": "BTC",
    "amount": 100,
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

1. **Setup Bot with UseGateway.net**
   - Create account on UseGateway.net
   - Get API key and webhook secret
   - Set webhook URL to: `{YOUR_SERVER_URL}/api/payments/webhook`

2. **Register Your Bot**
   - Use the register endpoint with your Telegram ID
   - Include your bot's name and Telegram token
   - Include UseGateway credentials
   - Save the bot token for future API requests

3. **Create Payment Flow**
   - When user requests payment in your bot:
     1. Call create payment endpoint with your bot token
     2. Send payment address to user
     3. Start checking payment status
     4. Wait for webhook confirmation

4. **Handle Payment Updates**
   - System automatically processes webhooks
   - Your bot will receive confirmation message
   - Update your bot's UI accordingly

## Error Handling

Common error responses:
```json
{
  "success": false,
  "error": "Error message"
}
```

Status codes:
- 400: Invalid input
- 401: Authentication failed (invalid or missing bot token)
- 404: Resource not found
- 500: Server error

## Security Notes

- Keep bot tokens and UseGateway credentials secure
- Use HTTPS in production
- Validate webhook signatures
- Monitor bot activity through logs
- Each bot token must be unique