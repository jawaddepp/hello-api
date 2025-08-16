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
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      maxRedirects: 0, // Disable automatic redirects to prevent loops
      timeout: 30000, // 30 second timeout
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Accept redirects as valid
      }
    });
  }

  /**
   * Create a new payment request
   * @param {Object} paymentData - Payment details
   * @param {string} paymentData.currency - Cryptocurrency (BTC, ETH, USDT, etc.)
   * @param {number} paymentData.amount - Amount in USD
   * @param {string} paymentData.orderId - Unique order identifier
   * @param {string} paymentData.callbackUrl - Webhook URL for payment notifications
   * @param {string} paymentData.returnUrl - URL to redirect after payment
   * @returns {Promise<Object>} Payment creation response
   */
  async createPayment(paymentData) {
    try {
      const payload = {
        currency: paymentData.currency,
        amount: paymentData.amount,
        order_id: paymentData.orderId,
        callback_url: paymentData.callbackUrl,
        return_url: paymentData.returnUrl,
        description: `Payment for order ${paymentData.orderId}`,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
      };

      console.log('Sending to UseGateway:', payload);
      
      let response;
      try {
        response = await this.client.post('/payments', payload);
      } catch (error) {
        // Handle redirect response
        if (error.response && error.response.status === 307) {
          const redirectUrl = error.response.headers.location;
          console.log('Following redirect to:', redirectUrl);
          
          // Make request to redirect URL
          response = await require('axios').post(redirectUrl, payload, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          });
        } else {
          throw error;
        }
      }
      
      console.log('UseGateway response:', response.data);
      return response.data;
    } catch (error) {
      console.error('UseGateway API Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers
      });
      throw new Error(`Payment creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get payment status
   * @param {string} paymentId - Payment ID from UseGateway
   * @returns {Promise<Object>} Payment status response
   */
  async getPaymentStatus(paymentId) {
    try {
      const response = await this.client.get(`/payments/${paymentId}`);
      return response.data;
    } catch (error) {
      console.error('UseGateway API Error:', error.response?.data || error.message);
      throw new Error(`Failed to get payment status: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Raw webhook payload
   * @param {string} signature - Webhook signature header
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(payload, signature) {
    try {
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

  /**
   * Get supported currencies
   * @returns {Promise<Array>} List of supported currencies
   */
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

  /**
   * Get current exchange rates
   * @param {string} currency - Cryptocurrency code
   * @returns {Promise<Object>} Exchange rate data
   */
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

