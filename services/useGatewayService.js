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
      timeout: 30000
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


    verifyWebhookSignature(payload, signature) {
    try {
      if (!signature) {
        console.error('No signature provided for webhook verification');
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');

      const receivedSignature = signature.replace('sha256=', '');

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

