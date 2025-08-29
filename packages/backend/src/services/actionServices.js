const pino = require('pino');
const logger = pino({ name: 'action-orchestrator' });

/**
 * ActionOrchestrator - Coordinates between different action services
 * like routing, notifications, and other emergency response actions
 */
class ActionOrchestrator {
  constructor() {
    this.routeService = new RouteService();
    this.notificationService = new NotificationService();
    this.logger = logger.child({ module: 'ActionOrchestrator' });
  }

  /**
   * Initialize all services with required configurations
   */
  async init() {
    try {
      await this.routeService.init();
      await this.notificationService.init();
      this.logger.info('Action services initialized successfully');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize action services');
      throw error;
    }
  }
}

/**
 * RouteService - Handles routing and evacuation planning
 */
class RouteService {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.baseUrl = 'https://maps.googleapis.com/maps/api/directions/json';
    this.logger = logger.child({ module: 'RouteService' });
  }

  async init() {
    if (!this.googleMapsApiKey) {
      this.logger.warn('Google Maps API key not configured. Some routing features may be limited.');
    }
  }

  /**
   * Generate evacuation routes from origin to multiple destinations
   */
  async generateEvacuationRoutes(origin, destinations, options = {}) {
    if (!this.googleMapsApiKey) {
      return this.generateMockRoutes(origin, destinations, options);
    }

    try {
      const routes = [];
      
      for (const dest of destinations) {
        const params = new URLSearchParams({
          origin: `${origin.lat},${origin.lng}`,
          destination: `${dest.lat},${dest.lng}`,
          key: this.googleMapsApiKey,
          mode: 'driving',
          alternatives: 'false',
          ...(options.avoidTolls && { avoid: 'tolls' }),
          ...(options.avoidHighways && { avoid: 'highways' }),
          traffic_model: 'pessimistic',
          departure_time: 'now'
        });

        const response = await fetch(`${this.baseUrl}?${params}`);
        const data = await response.json();

        if (data.status === 'OK' && data.routes.length > 0) {
          const route = data.routes[0];
          const leg = route.legs[0];
          
          routes.push({
            destination: {
              name: dest.name || 'Destination',
              lat: dest.lat,
              lng: dest.lng,
              type: dest.type
            },
            distance: leg.distance,
            duration: leg.duration,
            durationInTraffic: leg.duration_in_traffic || leg.duration,
            polyline: route.overview_polyline.points,
            steps: leg.steps.map(step => ({
              instruction: step.html_instructions,
              distance: step.distance.text,
              duration: step.duration.text,
              maneuver: step.maneuver || ''
            }))
          });
        }
      }

      // Sort by duration (fastest first)
      return routes.sort((a, b) => a.duration.value - b.duration.value);
    } catch (error) {
      this.logger.error({ error }, 'Error generating routes with Google Maps API');
      // Fallback to mock routes if API fails
      return this.generateMockRoutes(origin, destinations, options);
    }
  }

  /**
   * Generate mock routes for testing when API is not available
   */
  async generateMockRoutes(origin, destinations, options = {}) {
    this.logger.warn('Using mock route data - for testing only');
    
    return destinations.map((dest, index) => {
      const baseDuration = Math.floor(Math.random() * 15) + 5; // 5-20 minutes
      const trafficDelay = options.avoidHighways ? 0 : Math.floor(Math.random() * 10);
      
      return {
        destination: {
          name: dest.name || `Location ${index + 1}`,
          lat: dest.lat,
          lng: dest.lng,
          type: dest.type || 'shelter'
        },
        distance: { text: `${Math.floor(Math.random() * 15) + 2} km`, value: 0 },
        duration: { text: `${baseDuration} mins`, value: baseDuration * 60 },
        durationInTraffic: { 
          text: `${baseDuration + trafficDelay} mins`, 
          value: (baseDuration + trafficDelay) * 60 
        },
        polyline: 'mock_polyline_data',
        steps: [
          { instruction: 'Head northeast', distance: '0.5 km', duration: '2 mins' },
          { instruction: 'Turn right', distance: '1.2 km', duration: '4 mins' },
          { instruction: 'Arrive at destination', distance: '0 m', duration: '0 mins' }
        ]
      };
    });
  }

  /**
   * Create a shareable URL for a route
   */
  createShareableRouteUrl(origin, destination) {
    if (!this.googleMapsApiKey) {
      return 'https://maps.google.com';
    }
    
    const params = new URLSearchParams({
      api: '1',
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      travelmode: 'driving'
    });
    
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }
}

/**
 * NotificationService - Handles sending alerts and notifications
 */
class NotificationService {
  constructor() {
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.logger = logger.child({ module: 'NotificationService' });
  }

  async init() {
    if (!this.twilioAccountSid || !this.twilioAuthToken) {
      this.logger.warn('Twilio credentials not configured. SMS notifications will be simulated.');
    }
  }

  /**
   * Send emergency notifications to multiple recipients
   */
  async sendEmergencyNotification(recipients, message, options = {}) {
    const results = [];
    
    for (const recipient of recipients) {
      try {
        let result;
        
        if (this.twilioAccountSid && this.twilioAuthToken) {
          // Use real Twilio service
          const twilio = require('twilio')(this.twilioAccountSid, this.twilioAuthToken);
          
          const twilioMessage = await twilio.messages.create({
            body: message,
            from: this.twilioPhoneNumber,
            to: recipient.phone,
            statusCallback: process.env.TWILIO_STATUS_CALLBACK_URL,
            ...(options.priority === 'urgent' && { 
              forceDelivery: true,
              validityPeriod: 1440 // 24 hours in minutes
            })
          });
          
          result = {
            success: true,
            messageSid: twilioMessage.sid,
            status: twilioMessage.status,
            recipient
          };
        } else {
          // Simulate sending for development
          this.logger.info({
            to: recipient.phone,
            message: message.substring(0, 50) + '...',
            simulated: true
          }, 'Simulated SMS notification');
          
          result = {
            success: true,
            messageSid: `SIM_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
            status: 'sent',
            recipient
          };
        }
        
        results.push(result);
      } catch (error) {
        this.logger.error({ 
          error: error.message, 
          recipient: recipient.phone 
        }, 'Failed to send notification');
        
        results.push({
          success: false,
          error: error.message,
          recipient
        });
      }
    }
    
    return results;
  }
}

module.exports = {
  ActionOrchestrator,
  RouteService,
  NotificationService
};
