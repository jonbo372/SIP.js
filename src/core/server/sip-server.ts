import { Logger } from "../log/logger.js";
import { LoggerFactory } from "../log/logger-factory.js";
import { URI } from "../../grammar/uri.js";
import { Contact } from "../user-agent-core/user-agent-core-configuration.js";
import { UserAgentCore } from "../user-agent-core/user-agent-core.js";
import { UserAgentCoreConfiguration } from "../user-agent-core/user-agent-core-configuration.js";
import { UserAgentCoreDelegate } from "../user-agent-core/user-agent-core-delegate.js";
import { ServerConfiguration, ParsedListeningPoint, parseListeningPointURI } from "./server-configuration.js";
import { ServerMessageDispatcher } from "./server-message-dispatcher.js";
import { TCPServer } from "./tcp-server.js";
import { TCPServerTransport } from "./tcp-server-transport.js";

/**
 * SIP Server implementation.
 * @remarks
 * This server can listen on multiple transports (TCP, UDP, etc.) and
 * process incoming SIP messages using the existing UserAgentCore infrastructure.
 * @public
 */
export class SIPServer {
  private configuration: ServerConfiguration;
  private logger: Logger;
  private loggerFactory: LoggerFactory;
  private userAgentCores = new Map<string, UserAgentCore>();
  private messageDispatcher: ServerMessageDispatcher;

  private tcpServers = new Map<string, TCPServer>();
  private _isStarted = false;

  /**
   * Delegate for handling server events and SIP messages.
   */
  public delegate: UserAgentCoreDelegate | undefined;

  constructor(configuration: ServerConfiguration) {
    this.configuration = configuration;

    // Set up logging
    this.loggerFactory = configuration.loggerFactory || new LoggerFactory();
    this.logger = this.loggerFactory.getLogger("SIPServer");

    // Create message dispatcher (will route to appropriate UserAgentCore instances)
    this.messageDispatcher = new ServerMessageDispatcher(this, this.logger);

    this.logger.log("SIP Server created");
  }

  /**
   * Start the SIP server and begin listening on all configured listening points.
   */
  public async start(): Promise<void> {
    if (this._isStarted) {
      throw new Error("SIP Server is already started");
    }

    this.logger.log("Starting SIP Server...");

    for (const listeningPoint of this.configuration.listeningPoints) {
      await this.startListeningPoint(listeningPoint);
    }

    this._isStarted = true;
    this.logger.log("SIP Server started successfully");
  }

  /**
   * Stop the SIP server and close all listening points.
   */
  public async stop(): Promise<void> {
    if (!this._isStarted) {
      return;
    }

    this.logger.log("Stopping SIP Server...");

    // Close all TCP servers
    const closePromises = Array.from(this.tcpServers.values()).map((server) => server.close());
    await Promise.all(closePromises);

    // Dispose of all UserAgentCore instances
    for (const [aor, userAgentCore] of this.userAgentCores) {
      this.logger.log(`Disposing UserAgentCore for AOR: ${aor}`);
      userAgentCore.dispose();
    }

    this.tcpServers.clear();
    this.userAgentCores.clear();
    this._isStarted = false;

    this.logger.log("SIP Server stopped");
  }

  /**
   * Check if the server is currently running.
   */
  public get isStarted(): boolean {
    return this._isStarted;
  }

  /**
   * Get information about all active listening points.
   */
  public getListeningPoints(): Array<{ protocol: string; address: string; port: number; connections: number }> {
    const listeningPoints = [];

    for (const [key, server] of this.tcpServers.entries()) {
      const address = server.address();
      if (address) {
        listeningPoints.push({
          protocol: "TCP",
          address: address.address,
          port: address.port,
          connections: server.connectionCount
        });
      }
    }

    return listeningPoints;
  }

  /**
   * Get or create a UserAgentCore for the specified AOR.
   * @param aor - Address of Record URI
   * @returns UserAgentCore instance for the AOR
   */
  public getOrCreateUserAgentCore(aor: URI): UserAgentCore {
    const aorString = aor.toString();

    // Check if we already have a UserAgentCore for this AOR
    let userAgentCore = this.userAgentCores.get(aorString);
    if (userAgentCore) {
      return userAgentCore;
    }

    // Create new UserAgentCore for this AOR
    const hostname = this.configuration.hostname || aor.host;
    const contactUri = new URI("sip", aor.user || "server", hostname);

    const contact: Contact = {
      pubGruu: undefined,
      tempGruu: undefined,
      uri: contactUri,
      toString: () => contactUri.toString()
    };

    const coreConfig: UserAgentCoreConfiguration = {
      aor: aor,
      contact: contact,
      displayName: `SIP Server (${aorString})`,
      loggerFactory: this.loggerFactory,
      transportAccessor: () => {
        // Return the current transport being processed by the message dispatcher
        const currentTransport = this.messageDispatcher.getCurrentTransport();
        if (!currentTransport) {
          throw new Error("No active transport available. This should only be called during message processing.");
        }
        return currentTransport;
      },
      userAgentHeaderFieldValue: "SIP.js Server",
      hackViaTcp: false,
      routeSet: [],
      sipjsId: "SIPServer-" + aorString + "-" + Math.random().toString(36).substring(7),
      supportedOptionTags: ["100rel"],
      supportedOptionTagsResponse: ["100rel"],
      viaForceRport: false,
      viaHost: hostname,
      authenticationFactory: () => undefined
    };

    userAgentCore = new UserAgentCore(coreConfig, this.delegate);
    this.userAgentCores.set(aorString, userAgentCore);

    this.logger.log(`Created UserAgentCore for AOR: ${aorString}`);
    return userAgentCore;
  }

  /**
   * Get all registered UserAgentCore instances.
   */
  public getUserAgentCores(): Map<string, UserAgentCore> {
    return new Map(this.userAgentCores);
  }

  /**
   * Remove a UserAgentCore for the specified AOR.
   * @param aor - Address of Record URI
   */
  public removeUserAgentCore(aor: URI): void {
    const aorString = aor.toString();
    const userAgentCore = this.userAgentCores.get(aorString);
    if (userAgentCore) {
      userAgentCore.dispose();
      this.userAgentCores.delete(aorString);
      this.logger.log(`Removed UserAgentCore for AOR: ${aorString}`);
    }
  }

  private async startListeningPoint(listeningPoint: { uri: string; transportOptions?: unknown }): Promise<void> {
    const parsed: ParsedListeningPoint = parseListeningPointURI(listeningPoint.uri);

    switch (parsed.protocol) {
      case "tcp":
        await this.startTCPListeningPoint(parsed, listeningPoint.transportOptions);
        break;
      case "udp":
        throw new Error("UDP transport not yet implemented for server");
      case "ws":
      case "wss":
        throw new Error("WebSocket transport not yet implemented for server");
      default:
        throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }
  }

  private async startTCPListeningPoint(parsed: ParsedListeningPoint, transportOptions?: unknown): Promise<void> {
    const serverKey = `tcp://${parsed.host}:${parsed.port}`;

    if (this.tcpServers.has(serverKey)) {
      throw new Error(`TCP server already listening on ${serverKey}`);
    }

    const tcpServer = new TCPServer(this.loggerFactory.getLogger("TCPServer"));

    // Handle new connections
    tcpServer.onConnection = (transport: TCPServerTransport) => {
      this.messageDispatcher.addTransport(transport);
    };

    tcpServer.onError = (error: Error) => {
      this.logger.error(`TCP server error on ${serverKey}: ${error.toString()}`);
    };

    try {
      await tcpServer.listen(parsed.port, parsed.host);
      this.tcpServers.set(serverKey, tcpServer);
      this.logger.log(`TCP server listening on ${serverKey}`);
    } catch (error) {
      this.logger.error(`Failed to start TCP server on ${serverKey}: ${(error as Error).toString()}`);
      throw error;
    }
  }
}
