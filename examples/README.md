# SIP.js Server Examples

This directory contains examples demonstrating how to use SIP.js as a SIP server.

## Simple SIP Server

The `simple-server.js` example shows how to create a basic SIP server that:

- Listens on TCP port 5060
- Accepts incoming SIP INVITE requests for any AOR (Address of Record)
- Dynamically creates UserAgentCore instances per AOR
- Responds appropriately to various SIP methods
- Handles connections gracefully
- Supports multiple simultaneous users/accounts

### Running the Example

1. Build the SIP.js library first:
   ```bash
   cd .. # Go to the main SIP.js directory
   npm run build
   ```

2. Run the server example:
   ```bash
   cd examples
   npm run start
   # or
   node simple-server.js
   ```

3. The server will start listening on `tcp://0.0.0.0:5060`

### Testing the Server

You can test the server using various SIP clients:

**Using SIPp (if installed):**
```bash
# Send a simple INVITE
sipp -sn uac localhost:5060

# Send MESSAGE request  
sipp -sf message_scenario.xml localhost:5060
```

**Using a SIP phone:**
Configure your SIP phone to register to `sip:alice@localhost:5060` or `sip:bob@localhost:5060`

### Server Features

The example server handles:

- **INVITE requests**: Automatically accepts with 200 OK
- **MESSAGE requests**: Accepts and logs message content  
- **REGISTER requests**: Accepts registration attempts
- **Connection management**: Logs connect/disconnect events
- **Graceful shutdown**: Handles SIGINT and SIGTERM

### Architecture

The server uses the SIP.js server infrastructure with multi-AOR support:

- `SIPServer`: Main server class that manages listening points and UserAgentCore instances
- `TCPServer`: Handles TCP connections and creates transports
- `UserAgentCore`: Processes SIP messages using standard SIP.js core (one per AOR)
- `ServerMessageDispatcher`: Routes messages from transports to the appropriate UserAgentCore based on AOR
- **Multi-AOR Support**: Server automatically creates separate UserAgentCore instances for each unique AOR

### Extending the Example

You can extend this example by:

- Adding authentication logic
- Implementing call routing
- Adding database integration for user registration
- Supporting additional SIP methods
- Adding WebSocket transport support

See the SIP.js documentation for more advanced server configurations.