import { Logger } from "../log/logger.js";
import { Parser } from "../messages/parser.js";
import { IncomingRequestMessage } from "../messages/incoming-request-message.js";
import { IncomingResponseMessage } from "../messages/incoming-response-message.js";
import { UserAgentCore } from "../user-agent-core/user-agent-core.js";
import { TCPServerTransport } from "./tcp-server-transport.js";
import { URI } from "../../grammar/uri.js";

// Forward declaration to avoid circular dependency
interface SIPServerInterface {
  getOrCreateUserAgentCore(aor: URI): UserAgentCore;
}

/**
 * Message dispatcher for server-side SIP message handling.
 * @remarks
 * This class receives SIP messages from server transports and dispatches them
 * to the appropriate UserAgentCore for processing based on the message's AOR.
 * It also handles transport-specific message routing and error handling.
 * @internal
 */
export class ServerMessageDispatcher {
  private logger: Logger;
  private server: SIPServerInterface;
  private transports = new Map<TCPServerTransport, string>();
  private currentTransport: TCPServerTransport | undefined;

  constructor(server: SIPServerInterface, logger: Logger) {
    this.server = server;
    this.logger = logger;
  }

  /**
   * Register a server transport for message handling.
   * @param transport - Server transport to register
   */
  public addTransport(transport: TCPServerTransport): void {
    const transportId = `${transport.remoteAddress}:${transport.remotePort}`;
    this.transports.set(transport, transportId);

    // Set up message handler
    transport.onMessage = (message: string) => {
      this.handleMessage(message, transport);
    };

    // Clean up when transport closes
    transport.onClose = (hadError: boolean) => {
      this.removeTransport(transport);
    };

    transport.onError = (error: Error) => {
      this.logger.error(`Transport error for ${transportId}: ${error.toString()}`);
    };

    this.logger.log(`Added server transport: ${transportId}`);
  }

  /**
   * Remove a server transport from message handling.
   * @param transport - Server transport to remove
   */
  public removeTransport(transport: TCPServerTransport): void {
    const transportId = this.transports.get(transport);
    if (transportId) {
      this.transports.delete(transport);
      this.logger.log(`Removed server transport: ${transportId}`);
    }
  }

  /**
   * Get all registered transports.
   */
  public getTransports(): TCPServerTransport[] {
    return Array.from(this.transports.keys());
  }

  /**
   * Get the transport currently being processed.
   * Used by the server's transportAccessor to route responses correctly.
   */
  public getCurrentTransport(): TCPServerTransport | undefined {
    return this.currentTransport;
  }

  /**
   * Handle an incoming SIP message from a transport.
   * @param message - Raw SIP message string
   * @param transport - Transport that received the message
   */
  private handleMessage(message: string, transport: TCPServerTransport): void {
    const transportId = this.transports.get(transport);

    try {
      // Set the current transport context for this message processing
      this.currentTransport = transport;

      // Parse the SIP message
      const parsedMessage = Parser.parseMessage(message, this.logger);

      if (!parsedMessage) {
        this.logger.error(`Failed to parse message from ${transportId}`);
        this.logger.error(`Raw message:\n${message}`);
        return;
      }

      // Create a transport adapter that routes responses back to the correct transport
      const transportAdapter = this.createTransportAdapter(transport);

      if (parsedMessage instanceof IncomingRequestMessage) {
        this.logger.log(`Dispatching request ${parsedMessage.method} from ${transportId}`);

        // Check if To header exists
        if (!parsedMessage.to) {
          this.logger.error(`Missing To header in request from ${transportId}`);
          return;
        }

        // Extract AOR from the To header for incoming requests
        const toUri = parsedMessage.to.uri;
        const userAgentCore = this.server.getOrCreateUserAgentCore(toUri);

        this.logger.log(`Routing request to UserAgentCore for AOR: ${toUri.toString()}`);

        // Dispatch request to the appropriate UserAgentCore
        userAgentCore.receiveIncomingRequestFromTransport(parsedMessage);
      } else if (parsedMessage instanceof IncomingResponseMessage) {
        this.logger.log(`Dispatching response ${parsedMessage.statusCode} from ${transportId}`);

        // Check if From header exists
        if (!parsedMessage.from) {
          this.logger.error(`Missing From header in response from ${transportId}`);
          return;
        }

        // Extract AOR from the From header for incoming responses
        const fromUri = parsedMessage.from.uri;
        const userAgentCore = this.server.getOrCreateUserAgentCore(fromUri);

        this.logger.log(`Routing response to UserAgentCore for AOR: ${fromUri.toString()}`);

        // Dispatch response to the appropriate UserAgentCore
        userAgentCore.receiveIncomingResponseFromTransport(parsedMessage);
      } else {
        this.logger.error(`Unknown message type from ${transportId}`);
      }
    } catch (error) {
      this.logger.error(`Error handling message from ${transportId}: ${(error as Error).toString()}`);
      this.logger.error(`Message content:\n${message}`);
    } finally {
      // Clear the current transport context after processing
      this.currentTransport = undefined;
    }
  }

  /**
   * Create a transport adapter that routes messages back to the specific server transport.
   * @param serverTransport - The server transport to route messages to
   * @returns Transport adapter
   */
  private createTransportAdapter(serverTransport: TCPServerTransport) {
    return {
      protocol: serverTransport.protocol,

      send: async (message: string): Promise<void> => {
        return serverTransport.send(message);
      }
    };
  }
}
