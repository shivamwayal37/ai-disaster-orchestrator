/**
 * Kimi API Client
 * Handles text summarization, entity extraction, and embeddings
 */

const pino = require('pino');
const logger = pino({ name: 'kimi-client' });

class KimiClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.KIMI_API_KEY;
    this.baseURL = 'https://api.moonshot.ai/v1'; // Updated base URL
    this.model = 'moonshot-v1-8k';
    
    // Log API key info (without exposing the full key)
    if (this.apiKey) {
      const keyPrefix = this.apiKey.substring(0, 4);
      const keySuffix = this.apiKey.length > 8 ? '...' + this.apiKey.substring(this.apiKey.length - 4) : '';
      logger.info(`Initialized Kimi client with API key: ${keyPrefix}${keySuffix}`);
    } else {
      logger.warn('No API key provided for Kimi client');
    }
  }

  async makeRequest(endpoint, data, retries = 3, backoff = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify(data),
          timeout: 10000 // 10 second timeout
        });

        if (!response.ok) {
          let errorBody;
          try {
            errorBody = await response.text();
            // Try to parse as JSON if possible
            const jsonError = JSON.parse(errorBody);
            errorBody = JSON.stringify(jsonError, null, 2);
          } catch (e) {
            // If not JSON, use as text
          }
          
          // Don't retry on 4xx errors (except 429 - Too Many Requests)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            const errorMessage = `Kimi API client error: ${response.status} ${response.statusText}\n${errorBody || ''}`;
            throw new Error(errorMessage);
          }
          
          // For retryable errors, throw a special error
          throw new Error(`Kimi API error (attempt ${attempt}/${retries}): ${response.status} ${response.statusText}`);
        }

        const responseData = await response.json();
        logger.debug({
          endpoint,
          attempt,
          requestData: data,
          responseData
        }, 'Kimi API request successful');
        
        return responseData;
        
      } catch (error) {
        lastError = error;
        logger.warn({
          attempt,
          endpoint,
          error: error.message,
          remainingRetries: retries - attempt
        }, 'Kimi API request attempt failed');
        
        // If we have retries left, wait with exponential backoff
        if (attempt < retries) {
          const delay = backoff * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 1000));
        }
      }
    }
    
    // If we get here, all retries failed
    logger.error({
      endpoint,
      error: lastError.message,
      stack: lastError.stack,
      requestData: data
    }, 'All Kimi API request attempts failed');
    
    throw lastError;
  }

  async summarizeAlert(text, maxLength = 200) {
    const prompt = `Summarize this disaster alert in ${maxLength} characters or less. Focus on: type of disaster, location, severity, and immediate actions needed.

Alert text: ${text}

Provide a concise summary:`;

    try {
      const response = await this.makeRequest('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an emergency management expert. Provide clear, actionable summaries of disaster alerts.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.3
      });

      const summary = response.choices[0].message.content.trim();
      logger.info({ originalLength: text.length, summaryLength: summary.length }, 'Alert summarized');
      
      return summary;
    } catch (error) {
      logger.error(error, 'Failed to summarize alert');
      // Fallback: truncate original text
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    }
  }

  async extractEntities(text) {
    const prompt = `Extract structured information from this disaster alert. Return JSON only:

{
  "disaster_type": "flood|cyclone|earthquake|wildfire|heatwave|landslide|other",
  "severity": "low|moderate|high|severe|extreme", 
  "locations": ["primary location", "secondary location"],
  "coordinates": {"lat": number, "lng": number},
  "urgency": "immediate|expected|future|past",
  "affected_population": number,
  "key_actions": ["action1", "action2", "action3"]
}

Alert text: ${text}`;

    try {
      const response = await this.makeRequest('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a data extraction expert. Extract structured disaster information and return valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.1
      });

      const content = response.choices[0].message.content.trim();
      
      // Parse JSON response with multiple fallback strategies
      let entities = {};
      try {
        // Try direct JSON parse first
        entities = JSON.parse(content);
      } catch (parseError) {
        try {
          // Try to extract JSON from markdown code block
          const jsonMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            entities = JSON.parse(jsonMatch[1].trim());
          } else {
            // Try to find and parse just the JSON part
            const jsonStart = content.indexOf('{');
            const jsonEnd = content.lastIndexOf('}') + 1;
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
              entities = JSON.parse(content.substring(jsonStart, jsonEnd));
            } else {
              throw parseError;
            }
          }
        } catch (e) {
          logger.warn({ error: e.message, content }, 'Failed to parse entities as JSON, using fallback');
          // Continue to fallback below
        }
      }

      logger.info({ entities }, 'Entities extracted successfully');
      return entities;

    } catch (error) {
      logger.error(error, 'Failed to extract entities');
      
      // Fallback: basic entity extraction
      return {
        disaster_type: this.inferDisasterType(text),
        severity: this.inferSeverity(text),
        locations: this.extractLocations(text),
        coordinates: null,
        urgency: "expected",
        affected_population: null,
        key_actions: []
      };
    }
  }

  // Fallback methods for entity extraction
  inferDisasterType(text) {
    const types = {
      'flood': ['flood', 'flooding', 'rainfall', 'overflow', 'inundation'],
      'cyclone': ['cyclone', 'hurricane', 'typhoon', 'storm', 'wind'],
      'earthquake': ['earthquake', 'seismic', 'tremor', 'quake'],
      'wildfire': ['fire', 'wildfire', 'blaze', 'smoke'],
      'heatwave': ['heat', 'temperature', 'hot', 'heatwave'],
      'landslide': ['landslide', 'mudslide', 'slope failure']
    };

    const lowerText = text.toLowerCase();
    for (const [type, keywords] of Object.entries(types)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        return type;
      }
    }
    return 'other';
  }

  inferSeverity(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('extreme') || lowerText.includes('catastrophic')) return 'extreme';
    if (lowerText.includes('severe') || lowerText.includes('major')) return 'severe';
    if (lowerText.includes('moderate') || lowerText.includes('significant')) return 'moderate';
    if (lowerText.includes('minor') || lowerText.includes('low')) return 'low';
    return 'unknown';
  }

  extractLocations(text) {
    try {
      // Simple regex-based location extraction (fallback)
      const locationPatterns = [
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*([A-Z][a-z]+)/g, // City, State
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:district|region|area)/gi
      ];

      const locations = [];
      for (const pattern of locationPatterns) {
        try {
          const matches = [...text.matchAll(pattern)];
          locations.push(...matches.map(match => match[1] || match[0]));
        } catch (e) {
          logger.warn({ error: e.message }, 'Error matching location pattern');
        }
      }

      return [...new Set(locations)].slice(0, 3); // Unique locations, max 3
    } catch (error) {
      logger.error({ error: error.message }, 'Error in extractLocations');
      return [];
    }
  }

  async processAlert(alertData) {
    const text = alertData.description || alertData.text || alertData.content;
    
    logger.info({ alertId: alertData.id }, 'Processing alert with Kimi');

    try {
      // Run summarization and entity extraction in parallel
      const [summary, entities] = await Promise.all([
        this.summarizeAlert(text),
        this.extractEntities(text)
      ]);

      return {
        original: alertData,
        summary,
        entities,
        processed_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error(error, 'Failed to process alert');
      throw error;
    }
  }

  async generateRAGResponse(query, context) {
    const prompt = `You are an AI disaster response coordinator. Based on the query and retrieved context, provide a comprehensive response with actionable recommendations.

Query: ${query}

Retrieved Context:
${JSON.stringify(context, null, 2)}

Please provide:
1. Situation assessment based on similar incidents
2. Recommended immediate actions from relevant protocols
3. Resource deployment suggestions
4. Risk mitigation strategies
5. Coordination requirements

Format your response in clear sections with specific, actionable guidance.`;

    try {
      const response = await this.makeRequest('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert disaster response coordinator with access to historical incident data and emergency protocols. Provide clear, actionable guidance based on the retrieved context.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      });

      const ragResponse = response.choices[0].message.content.trim();
      
      logger.info({
        queryLength: query.length,
        contextSize: JSON.stringify(context).length,
        responseLength: ragResponse.length
      }, 'RAG response generated successfully');

      return ragResponse;

    } catch (error) {
      logger.error(error, 'RAG response generation failed');
      throw error;
    }
  }

}

// Singleton instance
let kimiClient = null;

function getKimiClient() {
  if (!kimiClient) {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) {
      throw new Error('KIMI_API_KEY environment variable is required');
    }
    kimiClient = new KimiClient(apiKey);
  }
  return kimiClient;
}

// No need to create an instance here - consumers should use getKimiClient()

// Helper function to ensure methods are bound to the instance
function bindMethod(methodName) {
  return async function(...args) {
    const instance = getKimiClient();
    return instance[methodName].apply(instance, args);
  };
}

module.exports = {
  KimiClient,
  getKimiClient,
  summarizeAlert: bindMethod('summarizeAlert'),
  extractEntities: bindMethod('extractEntities'),
  generateRAGResponse: bindMethod('generateRAGResponse'),
  processAlert: bindMethod('processAlert')
};
