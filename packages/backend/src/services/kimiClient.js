/**
 * Kimi API Client - Day 3
 * Handles text summarization and entity extraction
 */

const pino = require('pino');
const logger = pino({ name: 'kimi-client' });

class KimiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.moonshot.cn/v1';
    this.model = 'moonshot-v1-8k';
  }

  async makeRequest(endpoint, data) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`Kimi API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error(error, 'Kimi API request failed');
      throw error;
    }
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
      
      // Parse JSON response
      let entities;
      try {
        entities = JSON.parse(content);
      } catch (parseError) {
        // Try to extract JSON from response if wrapped in markdown
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          entities = JSON.parse(jsonMatch[1]);
        } else {
          throw parseError;
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
    if (lowerText.includes('moderate') || lowerText.includes('significant')) return 'high';
    if (lowerText.includes('minor') || lowerText.includes('low')) return 'low';
    return 'moderate';
  }

  extractLocations(text) {
    // Simple regex-based location extraction (fallback)
    const locationPatterns = [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*([A-Z][a-z]+)/g, // City, State
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:district|region|area)/gi
    ];

    const locations = [];
    for (const pattern of locationPatterns) {
      const matches = [...text.matchAll(pattern)];
      locations.push(...matches.map(match => match[1] || match[0]));
    }

    return [...new Set(locations)].slice(0, 3); // Unique locations, max 3
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

// Create a single instance to use for the module exports
const kimi = getKimiClient();

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
  generateRAGResponse: bindMethod('generateRAGResponse')
};
