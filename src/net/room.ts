// Connection to the multiplayer room (Cloudflare Durable Object).

import { NET } from '../config';
import { parseServerMessage, type ClientMessage, type ServerMessage } from '../logic/protocol';

export type RoomStatus = 'connecting' | 'online' | 'offline' | 'full' | 'missing';

export interface RoomHandlers {
  onMessage(msg: ServerMessage): void;
  onStatus(status: RoomStatus): void;
}

/** The room server address, or '' when playing without multiplayer. */
export const ROOM_URL: string = (import.meta.env.VITE_ROOM_URL ?? '').replace(/\/$/, '');

export class RoomClient {
  private socket: WebSocket | null = null;
  private retryDelay: number = NET.reconnectDelayMs;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private gotWelcome = false;

  constructor(
    private readonly code: string,
    private readonly avatar: string,
    private readonly handlers: RoomHandlers,
  ) {
    this.connect();
  }

  send(msg: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
  }

  private connect(): void {
    this.handlers.onStatus('connecting');
    const url = `${ROOM_URL.replace(/^http/, 'ws')}/room/${encodeURIComponent(this.code)}/ws`;
    const socket = new WebSocket(url);
    this.socket = socket;
    this.gotWelcome = false;

    socket.addEventListener('open', () => {
      this.retryDelay = NET.reconnectDelayMs;
      this.send({ t: 'hello', avatar: this.avatar });
    });
    socket.addEventListener('message', (event) => {
      const msg = parseServerMessage(event.data);
      if (!msg) return;
      if (msg.t === 'welcome') {
        this.gotWelcome = true;
        this.handlers.onStatus('online');
      }
      if (msg.t === 'full') {
        this.closed = true;
        this.handlers.onStatus('full');
      }
      this.handlers.onMessage(msg);
    });
    socket.addEventListener('close', () => {
      if (this.closed) return;
      this.handlers.onStatus('offline');
      this.retryTimer = setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, NET.reconnectMaxDelayMs);
    });
  }

  /** True until the first welcome arrives (for the loading screen). */
  get waitingForWelcome(): boolean {
    return !this.gotWelcome;
  }
}
