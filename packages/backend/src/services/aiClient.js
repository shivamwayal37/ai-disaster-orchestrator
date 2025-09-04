/**
 * AI Client Module
 * Centralized AI client to avoid circular dependencies
 */
require('dotenv').config();
const pino = require('pino');
const OpenAI = require('openai');

const logger = pino({ name: 'ai-client' });

// AI Client Factory - supports multiple providers
class AIClientFactory {
  static create(provider = 'moonshot') {
    switch (provider) {
      case 'moonshot':
        return new MoonshotAIClient();
      case 'openai':
        return new OpenAIClient();
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }
}

// Moonshot AI Client Implementation (via OpenAI SDK)
class MoonshotAIClient {
  constructor() {
    this.apiKey = process.env.KIMI_API_KEY; // ✅ use correct env var
    this.model = 'moonshot-v1-8k';

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://api.moonshot.ai/v1', // ✅ correct baseURL
    });
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async generateResponse(prompt, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2000,
        top_p: options.top_p ?? 1,
        stream: false, // ⚠️ use streaming only if you handle it
      });

      return response.choices[0].message.content;
    } catch (error) {
      logger.error({ error: error.message }, 'Moonshot AI request failed');
      throw error;
    }
  }
}

// OpenAI Client Implementation (still raw fetch or could also use SDK)
class OpenAIClient {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = 'gpt-3.5-turbo';

    this.client = new OpenAI({
      apiKey: this.apiKey,
    });
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async generateResponse(prompt, options = {}) {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2000,
        top_p: options.top_p ?? 1,
        stream: false,
      });

      return response.choices[0].message.content;
    } catch (error) {
      logger.error({ error: error.message }, 'OpenAI API request failed');
      throw error;
    }
  }
}

// Export factory and clients
module.exports = {
  AIClientFactory,
  MoonshotAIClient,
  OpenAIClient,
  aiClient: AIClientFactory.create(process.env.AI_PROVIDER || 'moonshot'),
};
