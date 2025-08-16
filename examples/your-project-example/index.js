/**
 * Example: Your Project Using SIP.js Library
 * 
 * This demonstrates how to use SIP.js as a library dependency
 * in your own Node.js project.
 */

import { Server, Core } from 'sip.js';

console.log('🚀 Starting My SIP Project');
console.log('Using SIP.js as a library dependency');

// Custom application configuration
const APP_CONFIG = {
  sipPort: 5070,
  domain: 'my-sip-domain.local',
  supportedUsers: ['alice', 'bob', 'charlie'],
  enableLogging: true
};

// Create SIP server with custom configuration
const createSipServer = () => {
  const loggerFactory = new Core.LoggerFactory();
  
  if (!APP_CONFIG.enableLogging) {
    // Disable logging if needed
    loggerFactory.level = 0;
  }

  const serverConfig = {
    listeningPoints: [
      { uri: `tcp://0.0.0.0:${APP_CONFIG.sipPort}` }
    ],
    hostname: APP_CONFIG.domain,
    loggerFactory: loggerFactory
  };

  const server = new Server.SIPServer(serverConfig);
  
  // Custom application logic
  server.delegate = {
    onInvite: (invitation) => {
      const fromUser = invitation.message.from.uri.user;
      const toUser = invitation.message.to.uri.user;
      
      console.log(`📞 Call attempt: ${fromUser} -> ${toUser}`);
      
      // Check if destination user is supported
      if (!APP_CONFIG.supportedUsers.includes(toUser)) {
        console.log(`❌ User ${toUser} not found`);
        invitation.reject({ statusCode: 404, reasonPhrase: "Not Found" });
        return;
      }
      
      console.log(`✅ Accepting call for ${toUser}`);
      
      // Custom SDP for your application
      const customSDP = `v=0
o=${APP_CONFIG.domain} 123456 654321 IN IP4 127.0.0.1
s=My SIP Application
c=IN IP4 127.0.0.1
t=0 0
m=audio 8000 RTP/AVP 0 8
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000`;

      invitation.accept({
        statusCode: 200,
        reasonPhrase: "OK",
        body: {
          contentType: "application/sdp",
          content: customSDP
        }
      });
    },

    onMessage: (message) => {
      const from = message.message.from.uri.user;
      const to = message.message.to.uri.user;
      const content = message.message.body || '';
      
      console.log(`💬 Message: ${from} -> ${to}: "${content}"`);
      
      // Your custom message handling logic here
      message.accept({ statusCode: 200, reasonPhrase: "Message Received" });
    },

    onRegister: (registration) => {
      const user = registration.message.from.uri.user;
      
      if (APP_CONFIG.supportedUsers.includes(user)) {
        console.log(`📝 User ${user} registered successfully`);
        registration.accept({ statusCode: 200, reasonPhrase: "Registered" });
      } else {
        console.log(`🚫 Registration denied for ${user}`);
        registration.reject({ statusCode: 403, reasonPhrase: "Forbidden" });
      }
    }
  };

  return server;
};

// Application lifecycle management
class MySipApp {
  constructor() {
    this.sipServer = createSipServer();
    this.isRunning = false;
  }

  async start() {
    try {
      console.log(`Starting SIP server on port ${APP_CONFIG.sipPort}...`);
      await this.sipServer.start();
      
      this.isRunning = true;
      console.log(`✅ My SIP App is running!`);
      console.log(`   Domain: ${APP_CONFIG.domain}`);
      console.log(`   Port: ${APP_CONFIG.sipPort}`);
      console.log(`   Supported users: ${APP_CONFIG.supportedUsers.join(', ')}`);
      
      this.setupMonitoring();
      
    } catch (error) {
      console.error('❌ Failed to start SIP application:', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) return;
    
    console.log('Stopping My SIP App...');
    await this.sipServer.stop();
    this.isRunning = false;
    console.log('✅ My SIP App stopped');
  }

  setupMonitoring() {
    // Monitor active UserAgentCores every 30 seconds
    setInterval(() => {
      const cores = this.sipServer.getUserAgentCores();
      if (cores.size > 0) {
        console.log(`📊 Active sessions: ${cores.size}`);
        for (const [aor] of cores) {
          console.log(`   - ${aor}`);
        }
      }
    }, 30000);
  }

  getStats() {
    const listeningPoints = this.sipServer.getListeningPoints();
    const userAgentCores = this.sipServer.getUserAgentCores();
    
    return {
      isRunning: this.isRunning,
      listeningPoints: listeningPoints,
      activeUsers: Array.from(userAgentCores.keys()),
      totalConnections: listeningPoints.reduce((sum, point) => sum + point.connections, 0)
    };
  }
}

// Create and start the application
const app = new MySipApp();

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  try {
    await app.stop();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the application
app.start().catch(error => {
  console.error('💥 Application failed to start:', error);
  process.exit(1);
});

// Export for testing or integration
export { app, APP_CONFIG };