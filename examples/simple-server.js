/**
 * Simple SIP Server Example
 * 
 * This example demonstrates how to create a basic SIP server that:
 * - Listens on TCP port 5060
 * - Accepts incoming SIP INVITE requests for any AOR (Address of Record)
 * - Dynamically creates UserAgentCore instances per AOR
 * - Responds with 200 OK to INVITEs
 * - Handles other SIP methods appropriately
 * - Supports multiple simultaneous users/accounts
 */

const { SIPServer } = require("../lib/core/server/sip-server.js");
const { LoggerFactory } = require("../lib/core/log/logger-factory.js");

// Create server configuration
const serverConfig = {
  listeningPoints: [
    {
      uri: "tcp://0.0.0.0:5060"
    }
  ],
  hostname: "localhost",
  loggerFactory: new LoggerFactory()
};

// Create the SIP server
const server = new SIPServer(serverConfig);

// Set up event handlers for incoming requests
server.delegate = {
  // Handle incoming INVITE requests
  onInvite: (invitation) => {
    console.log(`Received INVITE from: ${invitation.message.from}`);
    console.log(`To: ${invitation.message.to}`);
    console.log(`Call-ID: ${invitation.message.callId}`);
    
    // Create a simple SDP answer for the INVITE
    const sdpAnswer = `v=0
o=server 123456 654321 IN IP4 127.0.0.1
s=SIP.js Server
c=IN IP4 127.0.0.1
t=0 0
m=audio 7000 RTP/AVP 0
a=rtpmap:0 PCMU/8000`;

    // Accept the invitation with 200 OK and SDP answer
    try {
      invitation.accept({
        statusCode: 200,
        reasonPhrase: "OK",
        body: {
          contentType: "application/sdp",
          content: sdpAnswer
        }
      });
      console.log("INVITE accepted successfully");
    } catch (error) {
      console.error("Failed to accept INVITE:", error);
    }
  },
  
  // Handle incoming MESSAGE requests
  onMessage: (message) => {
    console.log(`Received MESSAGE from: ${message.message.from}`);
    console.log(`Content: ${message.message.body || "(no body)"}`);
    
    // Accept the message with 200 OK
    message.accept({
      statusCode: 200,
      reasonPhrase: "OK"
    });
  },
  
  // Handle incoming REGISTER requests
  onRegister: (registration) => {
    console.log(`Received REGISTER from: ${registration.message.from}`);
    
    // Accept the registration
    registration.accept({
      statusCode: 200,
      reasonPhrase: "OK"
    });
  },
  
  // Handle connection events
  onConnect: () => {
    console.log("Client connected");
  },
  
  onDisconnect: (error) => {
    console.log("Client disconnected", error ? `with error: ${error}` : "");
  }
};

// Start the server
async function startServer() {
  try {
    console.log("Starting SIP server...");
    await server.start();
    
    const listeningPoints = server.getListeningPoints();
    listeningPoints.forEach(point => {
      console.log(`SIP Server listening on ${point.protocol}://${point.address}:${point.port}`);
    });
    
    console.log("SIP Server is ready to accept connections!");
    console.log("The server will create separate UserAgentCore instances for each AOR automatically");
    
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log("\nShutting down SIP server...");
  try {
    await server.stop();
    console.log("SIP server stopped");
    process.exit(0);
  } catch (error) {
    console.error("Error stopping server:", error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log("\nShutting down SIP server...");
  try {
    await server.stop();
    console.log("SIP server stopped");
    process.exit(0);
  } catch (error) {
    console.error("Error stopping server:", error);
    process.exit(1);
  }
});

// Start the server
startServer();