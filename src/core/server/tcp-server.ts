import { Logger } from "../log/logger.js";
import { TCPServerTransport } from "./tcp-server-transport.js";

// Node.js types for minimal TCP server interface
interface TCPSocket {
  setEncoding(encoding: string): void;
  on(event: "data", listener: (data: string) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (hadError: boolean) => void): void;
  write(buffer: string, encoding?: string, callback?: (error?: Error) => void): boolean;
  end(): void;
  destroy(): void;
  remoteAddress?: string;
  remotePort?: number;
  localAddress?: string;
  localPort?: number;
}

interface NodeTCPServer {
  listen(port: number, host?: string, callback?: () => void): void;
  on(event: "connection", listener: (socket: TCPSocket) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "listening", listener: () => void): void;
  close(callback?: () => void): void;
  address(): { address: string; family: string; port: number } | null;
}

interface NetModule {
  createServer(): NodeTCPServer;
}

// We'll load the net module dynamically when needed
let net: NetModule | undefined;

/**
 * TCP server for handling incoming SIP connections.
 * @internal
 */
export class TCPServer {
  private server: NodeTCPServer | undefined;
  private logger: Logger;
  private _isListening = false;
  private connections = new Set<TCPServerTransport>();

  /**
   * Callback for when a new connection is established.
   * The transport is ready to send/receive SIP messages.
   */
  public onConnection: ((transport: TCPServerTransport) => void) | undefined;

  /**
   * Callback for when the server encounters an error.
   */
  public onError: ((error: Error) => void) | undefined;

  /**
   * Callback for when the server starts listening.
   */
  public onListening: (() => void) | undefined;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Initialize the net module if not already loaded
   */
  private async initializeNet(): Promise<void> {
    if (net) return;

    try {
      // Try to get net module using eval to avoid TypeScript import issues
      const netModule = await eval('import("net")');
      net = netModule as NetModule;
    } catch (error) {
      throw new Error("Node.js 'net' module not available. TCP server can only be used in Node.js environment.");
    }
  }

  /**
   * Start listening for connections on the specified address and port.
   * @param port - Port number to listen on
   * @param host - Host address to bind to (default: "0.0.0.0")
   */
  public async listen(port: number, host = "0.0.0.0"): Promise<void> {
    if (this._isListening) {
      throw new Error("TCP server is already listening");
    }

    // Initialize the net module
    await this.initializeNet();

    this.server = net!.createServer();

    // Set up server event handlers
    this.server.on("connection", (socket: TCPSocket) => this.onServerConnection(socket));
    this.server.on("error", (error: Error) => this.onServerError(error));
    this.server.on("listening", () => this.onServerListening());

    return new Promise((resolve, reject) => {
      this.server!.listen(port, host, () => {
        this._isListening = true;
        this.logger.log(`TCP server listening on ${host}:${port}`);
        resolve();
      });

      this.server!.on("error", reject);
    });
  }

  /**
   * Stop the server and close all connections.
   */
  public async close(): Promise<void> {
    if (!this._isListening || !this.server) {
      return;
    }

    // Close all active connections
    for (const transport of this.connections) {
      transport.close();
    }
    this.connections.clear();

    return new Promise((resolve) => {
      this.server!.close(() => {
        this._isListening = false;
        this.logger.log("TCP server closed");
        resolve();
      });
    });
  }

  /**
   * Get the server's listening address and port.
   */
  public address(): { address: string; port: number } | null {
    if (!this.server) {
      return null;
    }
    const addr = this.server.address();
    if (!addr) {
      return null;
    }
    return {
      address: addr.address,
      port: addr.port
    };
  }

  /**
   * Check if the server is currently listening.
   */
  public get isListening(): boolean {
    return this._isListening;
  }

  /**
   * Get the number of active connections.
   */
  public get connectionCount(): number {
    return this.connections.size;
  }

  private onServerConnection(socket: TCPSocket): void {
    const transport = new TCPServerTransport(socket, this.logger);

    // Track the connection
    this.connections.add(transport);

    // Clean up when connection closes
    transport.onClose = (hadError: boolean) => {
      this.connections.delete(transport);
      this.logger.log(`TCP connection removed. Active connections: ${this.connections.size}`);
    };

    this.logger.log(
      `New TCP connection from ${transport.remoteAddress}:${transport.remotePort}. ` +
        `Active connections: ${this.connections.size}`
    );

    // Notify the handler
    if (this.onConnection) {
      try {
        this.onConnection(transport);
      } catch (e) {
        this.logger.error((e as Error).toString());
        this.logger.error("Exception thrown by onConnection callback");
      }
    }
  }

  private onServerError(error: Error): void {
    this.logger.error(`TCP server error: ${error.toString()}`);
    if (this.onError) {
      this.onError(error);
    }
  }

  private onServerListening(): void {
    const addr = this.address();
    if (addr) {
      this.logger.log(`TCP server listening on ${addr.address}:${addr.port}`);
    }
    if (this.onListening) {
      this.onListening();
    }
  }
}
