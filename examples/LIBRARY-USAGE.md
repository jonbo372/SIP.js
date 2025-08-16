# Using SIP.js as a Library

This guide shows how to use the SIP.js server components as a library in your own Node.js projects.

## Installation

You have several options for installing SIP.js with server support:

### Option 1: Link Local Development Version (Recommended for Local Development)

If you're working locally on the same machine, you can use `npm link`:

```bash
# From the SIP.js directory
cd /home/jonas/private/development/SIP.js
npm link

# From your project directory
cd /path/to/your/project
npm link sip.js
```

### Option 2: Install from Local Path

```bash
# From your project directory
npm install /home/jonas/private/development/SIP.js
```

### Option 3: Install from Git Repository (if published)

```bash
npm install sip.js
```

## Basic Usage

### ES6 Modules (Recommended)

```javascript
import { Server, Core } from 'sip.js';

// Create server configuration
const config = {
  listeningPoints: [
    { uri: "tcp://0.0.0.0:5060" }
  ],
  hostname: "localhost",
  loggerFactory: new Core.LoggerFactory()
};

// Create server
const server = new Server.SIPServer(config);

// Set up event handlers
server.delegate = {
  onInvite: (invitation) => {
    console.log(`INVITE from: ${invitation.message.from}`);
    // Handle invitation...
  }
};

// Start server
await server.start();
```

### CommonJS

```javascript
const { Server, Core } = require('sip.js');

// Same usage as above...
```

### Import Individual Classes

```javascript
import { 
  SIPServer, 
  ServerConfiguration,
  TCPServer,
  ServerMessageDispatcher 
} from 'sip.js';
```

## Available Server Components

The library exports the following server components under the `Server` namespace:

- **`SIPServer`**: Main server class for multi-AOR SIP server
- **`ServerConfiguration`**: Configuration interfaces
- **`TCPServer`**: TCP transport server
- **`TCPServerTransport`**: Individual TCP connection handler
- **`ServerMessageDispatcher`**: Message routing and dispatch

## Core Features

### Multi-AOR Support

```javascript
// Server automatically creates UserAgentCore instances for each AOR
server.delegate = {
  onInvite: (invitation) => {
    // Each AOR (user) gets its own UserAgentCore
    const aor = invitation.message.to.uri.toString();
    console.log(`INVITE for AOR: ${aor}`);
  }
};
```

### Multiple Transport Support

```javascript
const config = {
  listeningPoints: [
    { uri: "tcp://0.0.0.0:5060" },
    { uri: "tcp://0.0.0.0:5061" },
    // UDP support coming soon
  ]
};
```

### Event Handling

```javascript
server.delegate = {
  onInvite: (invitation) => {
    // Handle incoming INVITE requests
    invitation.accept({
      statusCode: 200,
      reasonPhrase: "OK",
      body: { contentType: "application/sdp", content: sdpAnswer }
    });
  },
  
  onMessage: (message) => {
    // Handle incoming MESSAGE requests
    message.accept({ statusCode: 200, reasonPhrase: "OK" });
  },
  
  onRegister: (registration) => {
    // Handle incoming REGISTER requests
    registration.accept({ statusCode: 200, reasonPhrase: "OK" });
  }
};
```

## Advanced Usage

### Custom Logger Factory

```javascript
import { Core } from 'sip.js';

class CustomLoggerFactory extends Core.LoggerFactory {
  getLogger(category) {
    // Return custom logger implementation
    return new MyCustomLogger(category);
  }
}

const config = {
  loggerFactory: new CustomLoggerFactory()
};
```

### Managing UserAgentCores

```javascript
// Get all active UserAgentCores
const cores = server.getUserAgentCores();
console.log(`Active users: ${cores.size}`);

// Remove a specific UserAgentCore
const aorUri = new Core.URI("sip", "user", "domain.com");
server.removeUserAgentCore(aorUri);
```

### Server Information

```javascript
// Get listening points info
const points = server.getListeningPoints();
points.forEach(point => {
  console.log(`${point.protocol}://${point.address}:${point.port} (${point.connections} connections)`);
});

// Check server status
console.log(`Server running: ${server.isStarted}`);
```

## Example Project Structure

```
your-project/
├── package.json
├── src/
│   ├── index.js          # Your main application
│   ├── sip-server.js     # SIP server setup using library
│   └── handlers/
│       ├── invite.js     # INVITE request handlers
│       ├── message.js    # MESSAGE request handlers
│       └── register.js   # REGISTER request handlers
└── node_modules/
    └── sip.js/          # Linked or installed SIP.js
```

## Complete Working Example

See `library-usage-example.js` for a complete working example that demonstrates:

- Importing the library
- Setting up a server
- Handling different SIP methods
- Multi-AOR support
- Graceful shutdown
- Export for use in other modules

## TypeScript Support

The library includes full TypeScript definitions:

```typescript
import { Server, Core } from 'sip.js';

const config: Server.ServerConfiguration = {
  listeningPoints: [
    { uri: "tcp://0.0.0.0:5060" }
  ],
  hostname: "localhost"
};

const server = new Server.SIPServer(config);
```

## Error Handling

```javascript
try {
  await server.start();
} catch (error) {
  if (error.code === 'EADDRINUSE') {
    console.error('Port already in use');
  } else {
    console.error('Server start failed:', error);
  }
}
```

## Integration with Express/Fastify/etc.

The SIP server runs independently but can be integrated with web frameworks:

```javascript
import express from 'express';
import { Server, Core } from 'sip.js';

const app = express();
const sipServer = new Server.SIPServer(config);

// Start both HTTP and SIP servers
await Promise.all([
  sipServer.start(),
  new Promise(resolve => app.listen(3000, resolve))
]);

console.log('HTTP server on :3000, SIP server on :5060');
```