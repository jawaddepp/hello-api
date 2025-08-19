const axios = require('axios');
const crypto = require('crypto');

class UseGatewayService {
  constructor(apiKey, webhookSecret) {
    this.apiKey = apiKey;
    this.webhookSecret = webhookSecret;
    this.baseURL = 'https://api.usegateway.net/v1';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000,
      maxRedirects: 0,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      }
    });
  }


  async createPayment(paymentData) {
    try {
      const payload = {
        name: `${paymentData.currency} Payment`,
        description: `Payment for order ${paymentData.orderId}`,
        pricing_type: "fixed_price",
        local_price: {
          amount: paymentData.amount,
          currency: "USD" // UseGateway expects USD for local_price, crypto currency is handled separately
        },
        metadata: {
          order_id: paymentData.orderId,
          crypto_currency: paymentData.currency // Store the actual crypto currency in metadata
        },
        redirect_url: paymentData.callbackUrl,
        cancel_url: paymentData.callbackUrl
      };

      console.log('Sending to UseGateway:', payload);
      
      const response = await this.client.post('/payments/', payload);
      
      console.log('UseGateway response status:', response.status);
      console.log('UseGateway response data:', response.data);
      
      return response.data;
    } catch (error) {
      console.error('UseGateway API Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers
      });
      
      // Log detailed validation errors
      if (error.response?.data?.detail) {
        console.error('UseGateway validation errors:', JSON.stringify(error.response.data.detail, null, 2));
      }
      
      throw new Error(`Payment creation failed: ${error.response?.data?.message || error.message}`);
    }
  }


  async getPaymentStatus(paymentId) {
    try {
      const response = await this.client.get(`/payments/${paymentId}`);
      return response.data;
    } catch (error) {
      console.error('UseGateway API Error:', error.response?.data || error.message);
      throw new Error(`Failed to get payment status: ${error.response?.data?.message || error.message}`);
    }
  }


    verifyWebhookSignature(payload, signature, headers = {}) {
    try {
      if (!signature) {
        console.error('No signature provided for webhook verification');
        return false;
      }

      // Handle svix signature format (v1,signature1 v1,signature2)
      if (signature.includes('v1,')) {
        console.log('Processing svix signature format');
        const signatures = signature.split(' ');
        
        // Get svix headers for proper signature verification
        const svixId = headers['svix-id'] || '';
        const svixTimestamp = headers['svix-timestamp'] || '';
        
        console.log('Svix ID:', svixId);
        console.log('Svix Timestamp:', svixTimestamp);
        
        // Create the signing string: svix-id.svix-timestamp.payload
        const signingString = `${svixId}.${svixTimestamp}.${payload}`;
        console.log('Signing string length:', signingString.length);
        
        for (const sig of signatures) {
          if (sig.startsWith('v1,')) {
            const sigValue = sig.substring(3); // Remove 'v1,'
            try {
              const expectedSignature = crypto
                .createHmac('sha256', this.webhookSecret)
                .update(signingString, 'utf8')
                .digest('base64');

              console.log('Expected signature:', expectedSignature);
              console.log('Received signature:', sigValue);

              if (sigValue === expectedSignature) {
                console.log('Svix signature verified successfully');
                return true;
              }
            } catch (e) {
              console.log('Failed to verify signature:', sigValue, e.message);
              continue;
            }
          }
        }
        console.log('No valid svix signatures found');
        return false;
      }

      // Handle regular signature formats
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');

      let receivedSignature = signature;
      if (signature.startsWith('sha256=')) {
        receivedSignature = signature.replace('sha256=', '');
      }

      if (expectedSignature.length !== receivedSignature.length) {
        console.error('Signature length mismatch:', {
          expected: expectedSignature.length,
          received: receivedSignature.length
        });
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(receivedSignature, 'hex')
      );
    } catch (error) {
      console.error('Webhook signature verification error:', error);
      return false;
    }
  }


  async getSupportedCurrencies() {
    try {
      const response = await this.client.get('/currencies');
      return response.data;
    } catch (error) {
      console.error('UseGateway API Error:', error.response?.data || error.message);
      // Return default currencies if API call fails
      return [
        { code: 'BTC', name: 'Bitcoin' },
        { code: 'ETH', name: 'Ethereum' },
        { code: 'USDT', name: 'Tether' },
        { code: 'LTC', name: 'Litecoin' },
        { code: 'BCH', name: 'Bitcoin Cash' },
        { code: 'XRP', name: 'Ripple' },
        { code: 'ADA', name: 'Cardano' },
        { code: 'DOT', name: 'Polkadot' },
        { code: 'MATIC', name: 'Polygon' }
      ];
    }
  }

  

  async getExchangeRate(currency) {
    try {
      const response = await this.client.get(`/rates/${currency}`);
      return response.data;
    } catch (error) {
      console.error('UseGateway API Error:', error.response?.data || error.message);
      throw new Error(`Failed to get exchange rate: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = UseGatewayService;

