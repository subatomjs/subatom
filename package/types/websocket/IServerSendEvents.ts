export interface SSEEvent {
  /** Maps to the `event:` field - the client-side listener name (`addEventListener(event, ...)`). Omit for the default "message" event. */
  event?: string;
  /** Serialized as JSON unless already a string. */
  data: unknown;
  /** Maps to `id:` - lets the browser send `Last-Event-ID` on reconnect so you can replay missed events. */
  id?: string;
  /** Maps to `retry:` - reconnection delay in ms for this event onward. */
  retry?: number;
}

export interface SSEOptions {
  /**
   * Interval in ms between heartbeat comments, which keep idle
   * connections alive through proxies/load balancers that kill
   * connections after a period of silence. Default 15000. Set 0 to
   * disable (e.g. in tests).
   */
  heartbeatInterval?: number;
  /** Sent as `retry:` on the initial connection. */
  retry?: number;
  /** Extra headers merged into the initial response (e.g. custom CORS). */
  headers?: Record<string, string>;
}