/**
 * Test script to verify library imports work correctly
 */

import { Server, Core } from '../lib/index.js';

console.log('Testing SIP.js library imports...');

// Test Server namespace exports
console.log('Available Server exports:');
console.log('  SIPServer:', typeof Server.SIPServer);
console.log('  ServerConfiguration:', typeof Server.ServerConfiguration);
console.log('  TCPServer:', typeof Server.TCPServer);
console.log('  TCPServerTransport:', typeof Server.TCPServerTransport);
console.log('  ServerMessageDispatcher:', typeof Server.ServerMessageDispatcher);

// Test Core namespace exports  
console.log('\nAvailable Core exports:');
console.log('  LoggerFactory:', typeof Core.LoggerFactory);
console.log('  UserAgentCore:', typeof Core.UserAgentCore);
console.log('  URI:', typeof Core.URI);

// Test creating instances
console.log('\nTesting instance creation...');

try {
  const loggerFactory = new Core.LoggerFactory();
  console.log('✓ LoggerFactory created successfully');

  const config = {
    listeningPoints: [
      { uri: "tcp://0.0.0.0:9999" } // Use different port for testing
    ],
    hostname: "localhost",
    loggerFactory: loggerFactory
  };

  const server = new Server.SIPServer(config);
  console.log('✓ SIPServer created successfully');

  // Test URI creation
  const testUri = new Core.URI("sip", "test", "example.com");
  console.log('✓ URI created successfully:', testUri.toString());

  console.log('\n🎉 All library imports and basic functionality working!');

} catch (error) {
  console.error('❌ Error testing library:', error);
}