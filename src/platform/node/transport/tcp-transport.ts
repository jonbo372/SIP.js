// Node.js types for minimal TCP socket interface
interface TCPSocket {
  setEncoding(encoding: string): void;
  on(event: "connect", listener: () => void): void;
  on(event: "data", listener: (data: string) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (hadError: boolean) => void): void;
  connect(options: { host: string; port: number; localAddress?: string; localPort?: number }): void;
  write(buffer: string, encoding?: string, callback?: (error?: Error) => void): boolean;
  end(): void;
  destroy(): void;
}

interface NetModule {
  Socket: new () => TCPSocket;
}

// Dynamic import for Node.js net module
const net = (globalThis as unknown as { require?: (id: string) => NetModule }).require?.("net") as NetModule;
import { Emitter, EmitterImpl } from "../../../api/emitter.js";
import { StateTransitionError } from "../../../api/exceptions/state-transition.js";
import { Transport as TransportDefinition } from "../../../api/transport.js";
import { TransportState } from "../../../api/transport-state.js";
import { Logger } from "../../../core/log/logger.js";
import { TCPTransportOptions } from "./tcp-transport-options.js";

/**
 * Transport for SIP over TCP.
 * @public
 */
export class TCPTransport implements TransportDefinition {
  private static getDefaultOptions(): TCPTransportOptions & {
    port: number;
    connectionTimeout: number;
    keepAliveInterval: number;
    keepAliveDebounce: number;
    traceSip: boolean;
  } {
    return {
      host: "",
      port: 5060,
      connectionTimeout: 5,
      keepAliveInterval: 0,
      keepAliveDebounce: 10,
      traceSip: true,
      localAddress: undefined,
      localPort: undefined
    };
  }

  public onConnect: (() => void) | undefined;
  public onDisconnect: ((error?: Error) => void) | undefined;
  public onMessage: ((message: string) => void) | undefined;

  private _protocol = "TCP";
  private _state: TransportState = TransportState.Disconnected;
  private _stateEventEmitter: EmitterImpl<TransportState>;
  private _socket: TCPSocket | undefined;

  private configuration: TCPTransportOptions & {
    port: number;
    connectionTimeout: number;
    keepAliveInterval: number;
    keepAliveDebounce: number;
    traceSip: boolean;
  };

  private connectPromise: Promise<void> | undefined;
  private connectResolve: (() => void) | undefined;
  private connectReject: ((error: Error) => void) | undefined;
  private connectTimeout: ReturnType<typeof setTimeout> | undefined;

  private disconnectPromise: Promise<void> | undefined;
  private disconnectResolve: (() => void) | undefined;
  private disconnectReject: ((error?: Error) => void) | undefined;

  private keepAliveInterval: ReturnType<typeof setInterval> | undefined;
  private keepAliveDebounceTimeout: ReturnType<typeof setTimeout> | undefined;

  private logger: Logger;
  private transitioningState = false;

  // Message parsing state
  private messageBuffer = "";
  private currentMessageLength: number | undefined;

  constructor(logger: Logger, options?: TCPTransportOptions) {
    // state emitter
    this._stateEventEmitter = new EmitterImpl<TransportState>();

    // logger
    this.logger = logger;

    // validate required options
    if (!options?.host) {
      throw new Error("TCP transport requires 'host' option");
    }

    // initialize configuration
    this.configuration = {
      // start with the default option values
      ...TCPTransport.getDefaultOptions(),
      // apply any options passed in via the constructor
      ...options
    };
  }

  public dispose(): Promise<void> {
    return this.disconnect();
  }

  /**
   * The protocol.
   */
  public get protocol(): string {
    return this._protocol;
  }

  /**
   * The target server host.
   */
  public get host(): string {
    return this.configuration.host;
  }

  /**
   * The target server port.
   */
  public get port(): number {
    return this.configuration.port;
  }

  /**
   * Transport state.
   */
  public get state(): TransportState {
    return this._state;
  }

  /**
   * Transport state change emitter.
   */
  public get stateChange(): Emitter<TransportState> {
    return this._stateEventEmitter;
  }

  /**
   * The TCP socket.
   */
  public get socket(): TCPSocket | undefined {
    return this._socket;
  }

  /**
   * Connect to server.
   */
  public connect(): Promise<void> {
    return this._connect();
  }

  /**
   * Disconnect from server.
   */
  public disconnect(): Promise<void> {
    return this._disconnect();
  }

  /**
   * Returns true if the `state` equals "Connected".
   */
  public isConnected(): boolean {
    return this.state === TransportState.Connected;
  }

  /**
   * Send a SIP message.
   */
  public send(message: string): Promise<void> {
    if (this.configuration.traceSip === true) {
      this.logger.log("Sending TCP message:\n\n" + message + "\n");
    }

    if (this._state !== TransportState.Connected) {
      return Promise.reject(new Error("Not connected."));
    }

    if (!this._socket) {
      throw new Error("TCP socket undefined.");
    }

    return new Promise((resolve, reject) => {
      try {
        this._socket?.write(message, "utf8", (error: Error | undefined) => {
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

  private _connect(): Promise<void> {
    this.logger.log(`Connecting to ${this.host}:${this.port}`);

    switch (this.state) {
      case TransportState.Connecting:
        if (this.transitioningState) {
          return Promise.reject(this.transitionLoopDetectedError(TransportState.Connecting));
        }
        if (!this.connectPromise) {
          throw new Error("Connect promise must be defined.");
        }
        return this.connectPromise;
      case TransportState.Connected:
        if (this.transitioningState) {
          return Promise.reject(this.transitionLoopDetectedError(TransportState.Connecting));
        }
        return Promise.resolve();
      case TransportState.Disconnecting:
        if (this.connectPromise) {
          throw new Error("Connect promise must not be defined.");
        }
        try {
          this.transitionState(TransportState.Connecting);
        } catch (e) {
          if (e instanceof StateTransitionError) {
            return Promise.reject(e);
          }
          throw e;
        }
        break;
      case TransportState.Disconnected:
        if (this.connectPromise) {
          throw new Error("Connect promise must not be defined.");
        }
        try {
          this.transitionState(TransportState.Connecting);
        } catch (e) {
          if (e instanceof StateTransitionError) {
            return Promise.reject(e);
          }
          throw e;
        }
        break;
      default:
        throw new Error("Unknown state");
    }

    let socket: TCPSocket;
    try {
      if (!net) {
        throw new Error("Node.js 'net' module not available. This transport can only be used in Node.js environment.");
      }
      socket = new net.Socket();
      socket.setEncoding("utf8");
      socket.on("connect", () => this.onSocketConnect(socket));
      socket.on("data", (data: string) => this.onSocketData(data, socket));
      socket.on("error", (error: Error) => this.onSocketError(error, socket));
      socket.on("close", (hadError: boolean) => this.onSocketClose(hadError, socket));
      this._socket = socket;
    } catch (error) {
      this._socket = undefined;
      this.logger.error("TCP socket creation failed.");
      this.logger.error((error as Error).toString());
      return new Promise((resolve, reject) => {
        this.connectResolve = resolve;
        this.connectReject = reject;
        this.transitionState(TransportState.Disconnected, error as Error);
      });
    }

    this.connectPromise = new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;

      this.connectTimeout = setTimeout(() => {
        this.logger.warn(
          "Connect timed out. " +
            "Exceeded time set in configuration.connectionTimeout: " +
            this.configuration.connectionTimeout +
            "s."
        );
        socket.destroy();
      }, this.configuration.connectionTimeout * 1000);
    });

    // Initiate connection
    socket.connect({
      host: this.configuration.host,
      port: this.configuration.port,
      localAddress: this.configuration.localAddress,
      localPort: this.configuration.localPort
    });

    return this.connectPromise;
  }

  private _disconnect(): Promise<void> {
    this.logger.log(`Disconnecting from ${this.host}:${this.port}`);

    switch (this.state) {
      case TransportState.Connecting:
        if (this.disconnectPromise) {
          throw new Error("Disconnect promise must not be defined.");
        }
        try {
          this.transitionState(TransportState.Disconnecting);
        } catch (e) {
          if (e instanceof StateTransitionError) {
            return Promise.reject(e);
          }
          throw e;
        }
        break;
      case TransportState.Connected:
        if (this.disconnectPromise) {
          throw new Error("Disconnect promise must not be defined.");
        }
        try {
          this.transitionState(TransportState.Disconnecting);
        } catch (e) {
          if (e instanceof StateTransitionError) {
            return Promise.reject(e);
          }
          throw e;
        }
        break;
      case TransportState.Disconnecting:
        if (this.transitioningState) {
          return Promise.reject(this.transitionLoopDetectedError(TransportState.Disconnecting));
        }
        if (!this.disconnectPromise) {
          throw new Error("Disconnect promise must be defined.");
        }
        return this.disconnectPromise;
      case TransportState.Disconnected:
        if (this.transitioningState) {
          return Promise.reject(this.transitionLoopDetectedError(TransportState.Disconnecting));
        }
        if (this.disconnectPromise) {
          throw new Error("Disconnect promise must not be defined.");
        }
        return Promise.resolve();
      default:
        throw new Error("Unknown state");
    }

    if (!this._socket) {
      throw new Error("TCP socket must be defined.");
    }
    const socket = this._socket;

    this.disconnectPromise = new Promise((resolve, reject) => {
      this.disconnectResolve = resolve;
      this.disconnectReject = reject;

      try {
        socket.end();
      } catch (error) {
        this.logger.error("TCP socket close failed.");
        this.logger.error((error as Error).toString());
        throw error;
      }
    });

    return this.disconnectPromise;
  }

  private onSocketConnect(socket: TCPSocket): void {
    if (socket !== this._socket) {
      return;
    }
    if (this._state === TransportState.Connecting) {
      this.logger.log(`TCP connected to ${this.host}:${this.port}`);
      this.transitionState(TransportState.Connected);
    }
  }

  private onSocketData(data: string, socket: TCPSocket): void {
    if (socket !== this._socket) {
      return;
    }

    if (this.state !== TransportState.Connected) {
      this.logger.warn("Received TCP data while not connected, discarding...");
      return;
    }

    // Add data to buffer and process messages
    this.messageBuffer += data;
    this.processMessageBuffer();
  }

  private onSocketError(error: Error, socket: TCPSocket): void {
    if (socket !== this._socket) {
      return;
    }
    this.logger.error("TCP socket error occurred: " + error.toString());
  }

  private onSocketClose(hadError: boolean, socket: TCPSocket): void {
    if (socket !== this._socket) {
      return;
    }

    const message = `TCP connection closed to ${this.host}:${this.port}${hadError ? " due to error" : ""}`;
    const error = !this.disconnectPromise ? new Error(message) : undefined;
    if (error) {
      this.logger.warn("TCP connection closed unexpectedly");
    }
    this.logger.log(message);

    // Clear socket reference
    this._socket = undefined;

    // Reset message parsing state
    this.messageBuffer = "";
    this.currentMessageLength = undefined;

    // Transition to disconnected
    this.transitionState(TransportState.Disconnected, error);
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

        if (this.configuration.traceSip === true) {
          this.logger.log("Received TCP message:\n\n" + completeMessage + "\n");
        }

        // Handle CRLF keep-alive
        if (/^(\r\n)+$/.test(completeMessage)) {
          this.clearKeepAliveTimeout();
          if (this.configuration.traceSip === true) {
            this.logger.log("Received TCP CRLF Keep Alive response");
          }
          continue;
        }

        // Deliver message to application
        if (this.onMessage) {
          try {
            this.onMessage(completeMessage);
          } catch (e) {
            this.logger.error((e as Error).toString());
            this.logger.error("Exception thrown by onMessage callback");
            throw e;
          }
        }
      } else {
        // Need more data to complete message
        return;
      }
    }
  }

  private transitionLoopDetectedError(state: string): StateTransitionError {
    let message = `A state transition loop has been detected.`;
    message += ` An attempt to transition from ${this._state} to ${state} before the prior transition completed.`;
    message += ` Perhaps you are synchronously calling connect() or disconnect() from a callback or state change handler?`;
    this.logger.error(message);
    return new StateTransitionError("Loop detected.");
  }

  private transitionState(newState: TransportState, error?: Error): void {
    const invalidTransition = (): Error => {
      throw new Error(`Invalid state transition from ${this._state} to ${newState}`);
    };

    if (this.transitioningState) {
      throw this.transitionLoopDetectedError(newState);
    }
    this.transitioningState = true;

    // Validate state transition
    switch (this._state) {
      case TransportState.Connecting:
        if (
          newState !== TransportState.Connected &&
          newState !== TransportState.Disconnecting &&
          newState !== TransportState.Disconnected
        ) {
          invalidTransition();
        }
        break;
      case TransportState.Connected:
        if (newState !== TransportState.Disconnecting && newState !== TransportState.Disconnected) {
          invalidTransition();
        }
        break;
      case TransportState.Disconnecting:
        if (newState !== TransportState.Connecting && newState !== TransportState.Disconnected) {
          invalidTransition();
        }
        break;
      case TransportState.Disconnected:
        if (newState !== TransportState.Connecting) {
          invalidTransition();
        }
        break;
      default:
        throw new Error("Unknown state.");
    }

    // Update state
    const oldState = this._state;
    this._state = newState;

    // Local copies of promises
    const connectResolve = this.connectResolve;
    const connectReject = this.connectReject;

    // Reset connect promises if no longer connecting
    if (oldState === TransportState.Connecting) {
      this.connectPromise = undefined;
      this.connectResolve = undefined;
      this.connectReject = undefined;
    }

    // Local copies of disconnect promises
    const disconnectResolve = this.disconnectResolve;
    const disconnectReject = this.disconnectReject;

    // Reset disconnect promises if no longer disconnecting
    if (oldState === TransportState.Disconnecting) {
      this.disconnectPromise = undefined;
      this.disconnectResolve = undefined;
      this.disconnectReject = undefined;
    }

    // Clear any outstanding connect timeout
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = undefined;
    }

    this.logger.log(`Transitioned from ${oldState} to ${this._state}`);
    this._stateEventEmitter.emit(this._state);

    // Transition to Connected
    if (newState === TransportState.Connected) {
      this.startSendingKeepAlives();
      if (this.onConnect) {
        try {
          this.onConnect();
        } catch (e) {
          this.logger.error((e as Error).toString());
          this.logger.error("Exception thrown by onConnect callback");
          throw e;
        }
      }
    }

    // Transition from Connected
    if (oldState === TransportState.Connected) {
      this.stopSendingKeepAlives();
      if (this.onDisconnect) {
        try {
          if (error) {
            this.onDisconnect(error);
          } else {
            this.onDisconnect();
          }
        } catch (e) {
          this.logger.error((e as Error).toString());
          this.logger.error("Exception thrown by onDisconnect callback");
          throw e;
        }
      }
    }

    // Complete connect promise
    if (oldState === TransportState.Connecting) {
      if (!connectResolve || !connectReject) {
        throw new Error("Connect resolve/reject undefined.");
      }
      newState === TransportState.Connected ? connectResolve() : connectReject(error || new Error("Connect aborted."));
    }

    // Complete disconnect promise
    if (oldState === TransportState.Disconnecting) {
      if (!disconnectResolve || !disconnectReject) {
        throw new Error("Disconnect resolve/reject undefined.");
      }
      newState === TransportState.Disconnected
        ? disconnectResolve()
        : disconnectReject(error || new Error("Disconnect aborted."));
    }

    this.transitioningState = false;
  }

  // Keep-alive functionality
  private clearKeepAliveTimeout(): void {
    if (this.keepAliveDebounceTimeout) {
      clearTimeout(this.keepAliveDebounceTimeout);
    }
    this.keepAliveDebounceTimeout = undefined;
  }

  private sendKeepAlive(): Promise<void> {
    if (this.keepAliveDebounceTimeout) {
      return Promise.resolve();
    }

    this.keepAliveDebounceTimeout = setTimeout(() => {
      this.clearKeepAliveTimeout();
    }, this.configuration.keepAliveDebounce * 1000);

    return this.send("\r\n\r\n");
  }

  private startSendingKeepAlives(): void {
    const computeKeepAliveTimeout = (upperBound: number): number => {
      const lowerBound = upperBound * 0.8;
      return 1000 * (Math.random() * (upperBound - lowerBound) + lowerBound);
    };

    if (this.configuration.keepAliveInterval && !this.keepAliveInterval) {
      this.keepAliveInterval = setInterval(() => {
        this.sendKeepAlive();
        this.startSendingKeepAlives();
      }, computeKeepAliveTimeout(this.configuration.keepAliveInterval));
    }
  }

  private stopSendingKeepAlives(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
    if (this.keepAliveDebounceTimeout) {
      clearTimeout(this.keepAliveDebounceTimeout);
    }
    this.keepAliveInterval = undefined;
    this.keepAliveDebounceTimeout = undefined;
  }
}
