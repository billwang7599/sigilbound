/** The game socket. Reconnects on its own and resumes the last duel from localStorage. */
import type { ClientMessage, DuelUpdate, ServerMessage } from "@sigilbound/engine";

const SAVED = "sigilbound.duel";

export interface NetHandlers {
  onUpdate(u: DuelUpdate): void;
  onError(message: string): void;
  onStatus(connected: boolean): void;
}

export class Net {
  private ws: WebSocket | null = null;
  private queue: ClientMessage[] = [];
  private retry = 500;

  constructor(private readonly h: NetHandlers) {}

  connect(): void {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 500;
      this.h.onStatus(true);
      const queued = this.queue;
      this.queue = [];
      for (const m of queued) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as ServerMessage;
      if (msg.t === "duel") {
        localStorage.setItem(SAVED, JSON.stringify({ duelId: msg.duelId, token: msg.token }));
        this.h.onUpdate(msg);
      } else {
        if (msg.message === "duel not found") localStorage.removeItem(SAVED);
        this.h.onError(msg.message);
      }
    };
    ws.onclose = () => {
      this.h.onStatus(false);
      this.ws = null;
      setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 2, 5000);
    };
  }

  send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else this.queue.push(m);
  }

  saved(): { duelId: string; token: string } | null {
    try {
      return JSON.parse(localStorage.getItem(SAVED) ?? "null");
    } catch {
      return null;
    }
  }

  forget(): void {
    localStorage.removeItem(SAVED);
  }
}
