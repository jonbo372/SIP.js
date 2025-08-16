/**
 * Example of using SIP.js as a library in another Node.js project
 * 
 * This shows how to import and use the SIP server components
 * when SIP.js is installed as a dependency in your project.
 */

// Import the SIP.js library components
// You can import specific classes or the entire namespaces
import { Server, Core } from 'sip.js';

// Or import individual classes directly:
// import { SIPServer, ServerConfiguration } from 'sip.js';

// Alternative import style (if using CommonJS):
// const { Server, Core } = require('sip.js');

console.log('SIP.js Library Usage Example');

// Create server configuration
const serverConfig = {
  listeningPoints: [
    {
      uri: "tcp://0.0.0.0:5060"
    }
  ],
  hostname: "localhost",
  loggerFactory: new Core.LoggerFactory()
};

// Create the SIP server using the library
const server = new Server.SIPServer(serverConfig);

// Set up event handlers
server.delegate = {
  onInvite: (invitation) => {
    console.log(`Library: Received INVITE from ${invitation.message.from}`);
    console.log(`Library: To: ${invitation.message.to}`);
    
    // Create SDP answer
    const sdpAnswer = `v=0
o=library-server 123456 654321 IN IP4 127.0.0.1
s=SIP.js Library Server
c=IN IP4 127.0.0.1
t=0 0
m=audio 7000 RTP/AVP 0
a=rtpmap:0 PCMU/8000`;

    // Accept invitation
    try {
      invitation.accept({
        statusCode: 200,
        reasonPhrase: "OK",
        body: {
          contentType: "application/sdp",
          content: sdpAnswer
        }
      });
      console.log("Library: INVITE accepted");
    } catch (error) {
      console.error("Library: Failed to accept INVITE:", error);
    }
  },

  onMessage: (message) => {
    console.log(`Library: Received MESSAGE from ${message.message.from}`);
    console.log(`Library: Content: ${message.message.body || "(no body)"}`);
    
    message.accept({
      statusCode: 200,
      reasonPhrase: "OK"
    });
  }
};

// Function to start the library-based server
async function startLibraryServer() {
  try {
    console.log('Starting SIP server using SIP.js library...');
    await server.start();
    
    const listeningPoints = server.getListeningPoints();
    listeningPoints.forEach(point => {
      console.log(`Library Server listening on ${point.protocol}://${point.address}:${point.port}`);
    });
    
    console.log('Library-based SIP Server is ready!');
    console.log('This shows how to use SIP.js as a library in your projects.');
    
    // Show available UserAgentCores
    setTimeout(() => {
      const cores = server.getUserAgentCores();
      console.log(`Active UserAgentCores: ${cores.size}`);
      for (const [aor, core] of cores) {
        console.log(`  - AOR: ${aor}`);
      }
    }, 5000);
    
  } catch (error) {
    console.error('Failed to start library server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down library-based SIP server...');
  try {
    await server.stop();
    console.log('Library server stopped');
    process.exit(0);
  } catch (error) {
    console.error('Error stopping library server:', error);
    process.exit(1);
  }
});

// Export the server for use in other modules
export { server, startLibraryServer };

// Start if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startLibraryServer();
}