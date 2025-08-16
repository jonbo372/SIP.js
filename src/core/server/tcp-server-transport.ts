import { Logger } from "../log/logger.js";
import { Transport } from "../transport.js";

// Node.js types for minimal TCP socket interface
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

/**
 * Server-side TCP transport for handling incoming connections.
 * @remarks
 * This transport is attached to an existing TCP connection from a client.
 * Unlike the client TCP transport, this doesn't manage connection establishment.
 * @internal
 */
export class TCPServerTransport implements Transport {
  private _protocol = "TCP";
  private _socket: TCPSocket;
  private logger: Logger;

  // Message parsing state
  private messageBuffer = "";
  private currentMessageLength: number | undefined;

  /**
   * Callback for when a complete SIP message is received.
   */
  public onMessage: ((message: string) => void) | undefined;

  /**
   * Callback for when the connection is closed.
   */
  public onClose: ((hadError: boolean) => void) | undefined;

  /**
   * Callback for when an error occurs.
   */
  public onError: ((error: Error) => void) | undefined;

  constructor(socket: TCPSocket, logger: Logger) {
    this._socket = socket;
    this.logger = logger;

    // Set up socket event handlers
    this._socket.setEncoding("utf8");
    this._socket.on("data", (data: string) => this.onSocketData(data));
    this._socket.on("error", (error: Error) => this.onSocketError(error));
    this._socket.on("close", (hadError: boolean) => this.onSocketClose(hadError));

    this.logger.log(`TCP server transport created for connection from ${this.remoteAddress}:${this.remotePort}`);
  }

  /**
   * The transport protocol.
   */
  public get protocol(): string {
    return this._protocol;
  }

  /**
   * Remote address of the connected client.
   */
  public get remoteAddress(): string | undefined {
    return this._socket.remoteAddress;
  }

  /**
   * Remote port of the connected client.
   */
  public get remotePort(): number | undefined {
    return this._socket.remotePort;
  }

  /**
   * Local address of the server.
   */
  public get localAddress(): string | undefined {
    return this._socket.localAddress;
  }

  /**
   * Local port of the server.
   */
  public get localPort(): number | undefined {
    return this._socket.localPort;
  }

  /**
   * Send a SIP message to the connected client.
   * @param message - SIP message to send
   */
  public async send(message: string): Promise<void> {
    this.logger.log(`Sending TCP message to ${this.remoteAddress}:${this.remotePort}:\n\n${message}\n`);

    return new Promise((resolve, reject) => {
      try {
        this._socket.write(message, "utf8", (error: Error | undefined) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("TCP send failed."));
      }
    });
  }

  /**
   * Close the connection.
   */
  public close(): void {
    this.logger.log(`Closing TCP connection to ${this.remoteAddress}:${this.remotePort}`);
    this._socket.end();
  }

  /**
   * Forcefully destroy the connection.
   */
  public destroy(): void {
    this.logger.log(`Destroying TCP connection to ${this.remoteAddress}:${this.remotePort}`);
    this._socket.destroy();
  }

  private onSocketData(data: string): void {
    // Add data to buffer and process messages
    this.messageBuffer += data;
    this.processMessageBuffer();
  }

  private onSocketError(error: Error): void {
    this.logger.error(`TCP socket error from ${this.remoteAddress}:${this.remotePort}: ${error.toString()}`);
    if (this.onError) {
      this.onError(error);
    }
  }

  private onSocketClose(hadError: boolean): void {
    const message = `TCP connection closed from ${this.remoteAddress}:${this.remotePort}${
      hadError ? " due to error" : ""
    }`;
    this.logger.log(message);

    // Reset message parsing state
    this.messageBuffer = "";
    this.currentMessageLength = undefined;

    if (this.onClose) {
      this.onClose(hadError);
    }
  }

  private processMessageBuffer(): void {
    while (this.messageBuffer.length > 0) {
      // If we don't know the message length, try to find it
      if (this.currentMessageLength === undefined) {
        const headerEndIndex = this.messageBuffer.indexOf("\r\n\r\n");
        if (headerEndIndex === -1) {
          // Haven't received complete headers yet
          return;
        }

        const headers = this.messageBuffer.substring(0, headerEndIndex);
        const contentLengthMatch = headers.match(/^Content-Length:\s*(\d+)$/im);

        if (contentLengthMatch) {
          this.currentMessageLength = headerEndIndex + 4 + parseInt(contentLengthMatch[1], 10);
        } else {
          // No Content-Length header, message ends with double CRLF
          this.currentMessageLength = headerEndIndex + 4;
        }
      }

      // Check if we have a complete message
      if (this.messageBuffer.length >= this.currentMessageLength) {
        const completeMessage = this.messageBuffer.substring(0, this.currentMessageLength);
        this.messageBuffer = this.messageBuffer.substring(this.currentMessageLength);
        this.currentMessageLength = undefined;

        this.logger.log(`Received TCP message from ${this.remoteAddress}:${this.remotePort}:\n\n${completeMessage}\n`);

        // Handle CRLF keep-alive
        if (/^(\r\n)+$/.test(completeMessage)) {
          this.logger.log(`Received TCP CRLF Keep Alive from ${this.remoteAddress}:${this.remotePort}`);
          continue;
        }

        // Deliver message to handler
        if (this.onMessage) {
          try {
            this.onMessage(completeMessage);
          } catch (e) {
            this.logger.error((e as Error).toString());
            this.logger.error("Exception thrown by onMessage callback");
          }
        }
      } else {
        // Need more data to complete message
        return;
      }
    }
  }
}
