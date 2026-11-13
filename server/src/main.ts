/** The only file that wires core to its outlets. */
import { randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { httpHandler } from "./api/http.js";
import { Duels } from "./core/duels.js";
import type { Clock, Ids } from "./core/ports.js";
import { MemoryDuelStore } from "./db/memory.js";
import { GameSocket } from "./ws/socket.js";

const port = Number(process.env.PORT ?? 8787);

const clock: Clock = {
  now: () => Date.now(),
  after: (ms, fn) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};
const ids: Ids = {
  duelId: () => randomBytes(8).toString("hex"),
  token: () => randomBytes(16).toString("hex"),
  seed: () => randomInt(0, 2 ** 32 - 1),
};

const store = new MemoryDuelStore();
const socket = new GameSocket();
const duels = new Duels({ store, clock, link: socket, ids });
socket.connect(duels);

const server = createServer(httpHandler({ duelCount: () => store.list().length }));
socket.attach(server);
server.listen(port, () => console.log(`sigilbound server on http://localhost:${port} (ws at /ws)`));

const shutdown = () => {
  duels.dispose();
  server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
