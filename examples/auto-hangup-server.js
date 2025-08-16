/**
 * Auto-Hangup SIP Server Example
 * 
 * This example demonstrates:
 * 1. Accept incoming INVITE requests
 * 2. Wait 5 seconds 
 * 3. Server initiates BYE to hang up the call
 * 
 * Perfect for testing or creating an answering service that 
 * automatically terminates calls after a brief period.
 */

import { Server, Core } from '../lib/index.js';

console.log('🤖 Auto-Hangup SIP Server');
console.log('Accepts calls and hangs up after 5 seconds');

// Server configuration
const serverConfig = {
  listeningPoints: [{ uri: "tcp://0.0.0.0:5060" }],
  hostname: "auto-hangup.local",
  loggerFactory: new Core.LoggerFactory()
};

const server = new Server.SIPServer(serverConfig);

// Track active calls for management
const activeCalls = new Map();

// Store dialog-to-transport mappings to enable server-initiated requests
const dialogTransportMap = new Map();

server.delegate = {
  onInvite: (invitation) => {
    const callId = invitation.message.callId;
    const fromUser = invitation.message.from.uri.user;
    const toUser = invitation.message.to.uri.user;
    
    console.log(`\n📞 Incoming call: ${fromUser} -> ${toUser}`);
    console.log(`   Call-ID: ${callId}`);
    
    // Create SDP answer
    const sdpAnswer = `v=0
o=auto-hangup 123456 654321 IN IP4 127.0.0.1
s=Auto-Hangup Server
c=IN IP4 127.0.0.1
t=0 0
m=audio 8000 RTP/AVP 0
a=rtpmap:0 PCMU/8000
a=sendrecv`;

    try {
      // Accept the call and get the response with session
      const response = invitation.accept({
        statusCode: 200,
        reasonPhrase: "OK",
        body: {
          contentType: "application/sdp",
          content: sdpAnswer
        }
      });
      
      console.log(`✅ Call accepted - audio session established`);
      console.log(`⏰ Starting 5 second countdown...`);
      
      // The response contains the session (dialog) we need for BYE
      const dialog = response ? response.session : null;

      console.log("Do we have a dialog? " + dialog);
      
      // Store call information including dialog reference
      activeCalls.set(callId, {
        invitation: invitation,
        dialog: dialog,
        fromUser: fromUser,
        toUser: toUser,
        startTime: new Date()
      });
      
      // SOLUTION: Wait for ACK to arrive, then send BYE immediately  
      // This avoids the transport context issue by sending BYE during ACK processing
      
      if (dialog) {
        // Override the dialog delegate to capture ACK and send BYE
        const originalDelegate = dialog.delegate;
        dialog.delegate = {
          ...originalDelegate,
          onAck: (ack) => {
            console.log(`📨 ACK received - scheduling immediate BYE...`);
            
            // Send BYE immediately while transport context is still active
            setTimeout(() => {
              console.log(`🔚 Sending BYE during transport context...`);
              try {
                dialog.bye();
                console.log(`✅ BYE sent successfully to ${fromUser}`);
              } catch (error) {
                console.error(`❌ Failed to send BYE during ACK: ${error.message}`);
              }
              // Clean up call tracking
              activeCalls.delete(callId);
            }, 5000); // 5 second delay as requested
            
            // Call original ACK handler if it exists
            if (originalDelegate?.onAck) {
              return originalDelegate.onAck(ack);
            }
            return Promise.resolve();
          }
        };
      }
      
    } catch (error) {
      console.error(`❌ Failed to accept call: ${error.message}`);
    }
  },

  onBye: (bye) => {
    const callId = bye.message.callId;
    console.log(`\n👋 Received BYE for call ${callId}`);
    
    // Clean up if we were tracking this call
    const callInfo = activeCalls.get(callId);
    if (callInfo) {
      clearTimeout(callInfo.hangupTimer);
      activeCalls.delete(callId);
      console.log(`🧹 Cleaned up call tracking`);
    }
    
    // Accept the BYE
    bye.accept({ statusCode: 200, reasonPhrase: "OK" });
    console.log(`✅ BYE accepted - call terminated`);
  },

  onMessage: (message) => {
    const from = message.message.from.uri.user;
    console.log(`💬 Received MESSAGE from ${from}: "${message.message.body}"`);
    message.accept({ statusCode: 200, reasonPhrase: "Message Received" });
  }
};

// Start server
async function startAutoHangupServer() {
  try {
    console.log('\nStarting Auto-Hangup SIP Server...');
    await server.start();
    
    const points = server.getListeningPoints();
    points.forEach(point => {
      console.log(`🎧 Listening on ${point.protocol}://${point.address}:${point.port}`);
    });
    
    console.log('\n🤖 Auto-Hangup Server ready!');
    console.log('📋 Behavior:');
    console.log('   1. Accepts all incoming INVITE requests');
    console.log('   2. Establishes audio session with 200 OK + SDP');
    console.log('   3. Waits exactly 5 seconds');
    console.log('   4. Sends BYE to terminate the call');
    console.log('\n💡 Test with: sipp -sn uac localhost:5060');
    console.log('   Or any SIP phone calling sip:test@localhost:5060');
    
    // Status monitoring
    setInterval(() => {
      if (activeCalls.size > 0) {
        console.log(`\n📊 Active calls: ${activeCalls.size}`);
        for (const [callId, info] of activeCalls) {
          const duration = Math.round((new Date() - info.startTime) / 1000);
          console.log(`   ${info.fromUser} -> ${info.toUser} (${duration}s)`);
        }
      }
    }, 10000);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Auto-Hangup Server...');
  
  // Clean up active calls
  for (const [callId, callInfo] of activeCalls) {
    clearTimeout(callInfo.hangupTimer);
    console.log(`🧹 Cleaned up call ${callId}`);
  }
  
  try {
    await server.stop();
    console.log('✅ Server stopped');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error stopping server:', error);
    process.exit(1);
  }
});

// Start the server
startAutoHangupServer();