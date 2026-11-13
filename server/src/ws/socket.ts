/** The game socket: validates, rate-limits and routes messages to core; implements the PlayerLink port. */
import type { Server } from "node:http";
import { IllegalActionError, type Action, type ServerMessage } from "@sigilbound/engine";
import { WebSocket, WebSocketServer } from "ws";
import { DuelError, type Duels } from "../core/duels.js";
import type { PlayerLink } from "../core/ports.js";
import { clientMessageSchema } from "./schema.js";

const MAX_BYTES = 4096;
/** Token bucket: a burst of 30, refilling 10 a second. */
const RATE = { burst: 30, perSecond: 10 };

export class GameSocket implements PlayerLink {
  private readonly watchers = new Map<string, Set<WebSocket>>();
  private duels: Duels | null = null;

  /** Two-step wiring because core needs the link and the socket needs core. */
  connect(duels: Duels): void {
    this.duels = duels;
  }

  send(duelId: string, message: ServerMessage): void {
    for (const ws of this.watchers.get(duelId) ?? []) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    }
  }

  attach(server: Server): WebSocketServer {
    const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_BYTES });
    wss.on("connection", (ws) => this.onConnection(ws));
    return wss;
  }

  private watch(ws: WebSocket, duelId: string, watching: { id: string | null }): void {
    if (watching.id) this.watchers.get(watching.id)?.delete(ws);
    watching.id = duelId;
    let set = this.watchers.get(duelId);
    if (!set) this.watchers.set(duelId, (set = new Set()));
    set.add(ws);
  }

  private onConnection(ws: WebSocket): void {
    const watching = { id: null as string | null };
    /** Duels this socket has proven it owns (by creating them or resuming with the token). */
    const owned = new Set<string>();
    let tokens = RATE.burst, last = Date.now();
    const error = (message: string) => ws.send(JSON.stringify({ t: "error", message } satisfies ServerMessage));

    ws.on("message", (raw) => {
      const now = Date.now();
      tokens = Math.min(RATE.burst, tokens + ((now - last) / 1000) * RATE.perSecond);
      last = now;
      if (tokens < 1) return error("slow down");
      tokens--;
      const duels = this.duels!;
      let parsed;
      try {
        parsed = clientMessageSchema.safeParse(JSON.parse(String(raw)));
      } catch {
        return error("bad message");
      }
      if (!parsed.success) return error("bad message");
      const msg = parsed.data;
      try {
        if (msg.t === "new") {
          // start() announces the duel before anyone watches it; AI moves come later on a timer, so sending the
          // full picture right after is enough.
          const duel = duels.start(msg.deck);
          owned.add(duel.id);
          this.watch(ws, duel.id, watching);
          ws.send(JSON.stringify(duels.resume(duel.id, duel.token)));
        } else if (msg.t === "resume") {
          const update = duels.resume(msg.duelId, msg.token);
          if (!update) return error("duel not found");
          owned.add(msg.duelId);
          this.watch(ws, msg.duelId, watching);
          ws.send(JSON.stringify(update));
        } else if (msg.t === "hurry") {
          if (!owned.has(msg.duelId)) return error("not your duel");
          duels.hurry(msg.duelId, msg.until);
        } else {
          if (!owned.has(msg.duelId)) return error("not your duel");
          duels.act(msg.duelId, msg.action as Action);
        }
      } catch (err) {
        if (err instanceof IllegalActionError || err instanceof DuelError) return error(err.message);
        throw err;
      }
    });
    ws.on("close", () => {
      if (watching.id) this.watchers.get(watching.id)?.delete(ws);
    });
  }
}
