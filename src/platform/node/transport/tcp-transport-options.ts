/**
 * TCP transport options.
 * @public
 */
export interface TCPTransportOptions {
  /**
   * Hostname or IP address of the SIP server to connect to.
   * @example "sip.example.com" or "192.168.1.100"
   */
  host: string;

  /**
   * Port number of the SIP server.
   * @defaultValue `5060`
   */
  port?: number;

  /**
   * Seconds to wait for TCP connection to establish before giving up.
   * @defaultValue `5`
   */
  connectionTimeout?: number;

  /**
   * Keep alive interval in seconds.
   * If > 0, CRLF keep-alive messages will be sent at this interval.
   * @defaultValue `0` (disabled)
   */
  keepAliveInterval?: number;

  /**
   * Keep alive debounce time in seconds.
   * @defaultValue `10`
   * @internal
   */
  keepAliveDebounce?: number;

  /**
   * If true, messages sent and received by the transport are logged.
   * @defaultValue `true`
   */
  traceSip?: boolean;

  /**
   * Local interface to bind to for outgoing connection.
   * If not specified, the OS will choose the interface.
   * @defaultValue `undefined`
   */
  localAddress?: string | undefined;

  /**
   * Local port to bind to for outgoing connection.
   * If not specified, the OS will choose a random available port.
   * @defaultValue `undefined`
   */
  localPort?: number | undefined;
}
