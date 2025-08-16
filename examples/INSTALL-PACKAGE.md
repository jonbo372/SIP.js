# Installing SIP.js Server Library Package

You now have a packaged version of SIP.js with server support that you can install in your projects.

## Package Information

- **Package**: `sip.js-0.22.0-server.1.tgz`
- **Version**: `0.22.0-server.1`
- **Features**: Complete SIP.js library + Server components
- **Size**: ~267KB compressed, ~1.3MB unpacked

## Installation Options

### Option 1: Install from Local Package File

```bash
# Copy the package to your project or a shared location
cp /home/jonas/private/development/SIP.js/sip.js-0.22.0-server.1.tgz ~/my-packages/

# In your project directory
npm install ~/my-packages/sip.js-0.22.0-server.1.tgz
```

### Option 2: Install with Relative Path

```bash
# If your project is near the SIP.js directory
npm install ../path/to/SIP.js/sip.js-0.22.0-server.1.tgz
```

### Option 3: Direct File Path in package.json

```json
{
  "dependencies": {
    "sip.js": "file:../path/to/SIP.js/sip.js-0.22.0-server.1.tgz"
  }
}
```

## Usage After Installation

```javascript
import { Server, Core } from 'sip.js';

console.log('SIP.js version:', Core.version); // "0.22.0-server.1"

// Create server
const server = new Server.SIPServer({
  listeningPoints: [{ uri: "tcp://0.0.0.0:5060" }],
  loggerFactory: new Core.LoggerFactory()
});

// Your server code...
```

## Verification

Check that your installation includes server components:

```javascript
import { Server } from 'sip.js';

console.log('Available server components:');
console.log('- SIPServer:', typeof Server.SIPServer);
console.log('- TCPServer:', typeof Server.TCPServer);
console.log('- TCPServerTransport:', typeof Server.TCPServerTransport);
console.log('- ServerMessageDispatcher:', typeof Server.ServerMessageDispatcher);
```

Expected output:
```
Available server components:
- SIPServer: function
- TCPServer: function  
- TCPServerTransport: function
- ServerMessageDispatcher: function
```

## Distribution

You can share this package with other developers:

1. **Copy the .tgz file** to shared storage or send directly
2. **Publish to private npm registry** if you have one
3. **Include in git repository** (though not recommended for size)
4. **Create multiple versions** by repeating the `npm pack` process

## Creating New Versions

If you make changes to the server components:

```bash
# 1. Update version number
npm version patch  # or minor/major

# 2. Rebuild library
npm run build-lib

# 3. Create new package
npm pack

# 4. Install in your projects
npm install ./sip.js-0.22.0-server.2.tgz  # new version
```

## Project Template

Use the `your-project-example/` folder as a template for new projects:

```bash
# Copy the example project
cp -r /home/jonas/private/development/SIP.js/examples/your-project-example my-new-sip-project

# Update package.json with correct path to the .tgz file
cd my-new-sip-project
# Edit package.json dependencies section

# Install and run
npm install
npm start
```

This gives you a clean, versioned library package that you can easily distribute and install across multiple local projects!