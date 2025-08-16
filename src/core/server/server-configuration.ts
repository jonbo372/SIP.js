import { Logger } from "../log/logger.js";
import { LoggerFactory } from "../log/logger-factory.js";

/**
 * Server listening point configuration.
 * @public
 */
export interface ServerListeningPoint {
  /**
   * Protocol and address specification.
   * @example "tcp://0.0.0.0:5060" or "udp://127.0.0.1:5060"
   */
  uri: string;

  /**
   * Optional configuration for the transport.
   */
  transportOptions?: unknown;
}

/**
 * Server configuration options.
 * @public
 */
export interface ServerConfiguration {
  /**
   * Array of listening points where the server will accept connections.
   */
  listeningPoints: ServerListeningPoint[];

  /**
   * Server hostname to use in Via headers and contact URIs.
   * @defaultValue "localhost"
   */
  hostname?: string;

  /**
   * Logger factory for server components.
   */
  loggerFactory?: LoggerFactory;

  /**
   * Optional user data associated with the server.
   */
  userData?: unknown;
}

/**
 * Parsed listening point information.
 * @internal
 */
export interface ParsedListeningPoint {
  protocol: "tcp" | "udp" | "ws" | "wss";
  host: string;
  port: number;
  transportOptions?: unknown;
}

/**
 * Parse a listening point URI into its components.
 * @param uri - URI string like "tcp://0.0.0.0:5060"
 * @returns Parsed components
 * @internal
 */
export function parseListeningPointURI(uri: string): ParsedListeningPoint {
  const match = uri.match(/^(tcp|udp|ws|wss):\/\/([^:]+):(\d+)$/);
  if (!match) {
    throw new Error(`Invalid listening point URI: ${uri}. Expected format: protocol://host:port`);
  }

  const [, protocol, host, portStr] = match;
  const port = parseInt(portStr, 10);

  if (port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${port}. Must be between 1 and 65535`);
  }

  return {
    protocol: protocol as "tcp" | "udp" | "ws" | "wss",
    host,
    port
  };
}
