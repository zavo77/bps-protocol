// Minimal HTTP server: GET /health → 200 while the process is alive, with an
// honest status body (cursors, head, lag, db state). Binds 0.0.0.0:$PORT.

import http from "node:http";
import { status } from "./indexer.js";

const startedAt = Date.now();

export function startHealthServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/health" || req.url === "/health/")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          db: status.dbOk ? "ok" : "pending",
          headBlock: status.headBlock,
          swapsCursor: status.swapsCursor,
          lagBlocks: status.lagBlocks,
          trackedMarkets: status.trackedMarkets,
          knownPools: status.knownPools,
          lastPollOkAt: status.lastPollOkAt,
          lastError: status.lastError,
        }),
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  server.listen(port, "0.0.0.0");
  return server;
}
