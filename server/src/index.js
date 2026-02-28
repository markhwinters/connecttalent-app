import "dotenv/config";
import http from "http";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { WebSocketServer } from "ws";
import { router as apiRouter } from "./routes/api.js";
import { createWebSocketServer } from "./ws/server.js";
import { wsUpgradeProtection } from "./middleware/arcjet.js";
import { pool } from "./db/client.js";
import { closeRedis } from "./lib/redis.js";

const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);
app.use(express.json({ limit: "50kb" })); // keep request bodies small

// Mount REST API
app.use("/api", apiRouter);

// 404 fallback for unmatched routes
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer(app);

// ─── WebSocket upgrade with Arcjet protection ─────────────────────────────────

server.on("upgrade", async (req, socket, head) => {
  // Only accept upgrades on /ws
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }

  try {
    // Arcjet protect() expects a req-like object with ip
    const decision = await wsUpgradeProtection.protect(req, {
      ip: req.socket.remoteAddress,
    });

    if (decision.isDenied()) {
      const msg = decision.reason.isBot()
        ? "HTTP/1.1 403 Forbidden\r\n\r\n"
        : "HTTP/1.1 429 Too Many Requests\r\n\r\n";
      socket.write(msg);
      socket.destroy();
      return;
    }
  } catch (err) {
    // If Arcjet is misconfigured, fail open in dev / fail closed in prod
    console.error("[Arcjet] WS upgrade check failed", err);
    if (process.env.NODE_ENV === "production") {
      socket.destroy();
      return;
    }
  }

  // Hand off to WS server (attached below)
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

// Attach WS server — noServer: true because we handle upgrade manually above
const wss = createWebSocketServer(server);

// Verify DB connectivity before accepting traffic
async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("[DB] PostgreSQL connected");
  } catch (err) {
    console.error("[DB] Failed to connect to PostgreSQL:", err.message);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[Server] WebSocket on ws://localhost:${PORT}/ws`);
    console.log(`[Server] Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  });
}

start();

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down gracefully`);

  server.close(async () => {
    await Promise.all([pool.end(), closeRedis()]);
    console.log("[Server] Clean exit");
    process.exit(0);
  });

  // Force exit after 10s if connections hang
  setTimeout(() => {
    console.error("[Server] Forced exit after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
