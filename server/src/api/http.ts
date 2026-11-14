/** Plain HTTP: a health check. (Accounts and collections land here later.) */
import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiDeps {
  duelCount(): number;
}

export function httpHandler(deps: ApiDeps) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    if (req.method === "GET" && req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, duels: deps.duelCount() }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  };
}
