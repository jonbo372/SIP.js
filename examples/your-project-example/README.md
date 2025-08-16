# My SIP Project - Using SIP.js Library

This is an example of how to use the SIP.js library in your own Node.js project.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run the application:
```bash
npm start
```

## Features

- **Custom SIP server** using SIP.js library
- **User management** with allowed user list
- **Custom SDP handling** for your application needs
- **Call routing** with user validation
- **Message handling** with custom logic
- **Registration management** with authentication
- **Monitoring** and statistics
- **Graceful shutdown** handling

## Configuration

Edit the `APP_CONFIG` in `index.js` to customize:

- SIP port (default: 5070)
- Domain name
- Supported users list
- Logging level

## Testing

Send SIP requests to test:

```bash
# REGISTER a user
sipp -sn uac -s alice localhost:5070

# Send INVITE  
sipp -sn uac -s bob localhost:5070

# Send MESSAGE
sipp -sf message.xml -s charlie localhost:5070
```

## Integration

This project shows how to:

1. **Import SIP.js as library**: `import { Server, Core } from 'sip.js'`
2. **Create custom server logic**: Application-specific user management
3. **Handle SIP methods**: INVITE, MESSAGE, REGISTER with custom responses
4. **Monitor server state**: Track active users and connections
5. **Application lifecycle**: Proper startup and shutdown procedures

## Project Structure

```
my-sip-project/
├── package.json          # Dependencies and scripts
├── index.js              # Main application using SIP.js library
└── README.md             # This file
```

## Next Steps

- Add database integration for user management
- Implement authentication/authorization
- Add call routing logic
- Integrate with web APIs
- Add monitoring and metrics
- Deploy to production environment