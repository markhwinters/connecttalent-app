import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { subscriber, publisher } from "../lib/redis.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const REDIS_CHANNEL = "connect-talent:ws";

// ─── In-memory state ─────────────────────────────────────────────────────────

/** @type {Map<string, WebSocket>} socketId → ws */
const clients = new Map();

/** @type {Map<string, Set<string>>} roomId → Set<socketId> */
const rooms = new Map();

/** @type {Map<string, string>} socketId → userId */
const socketUserMap = new Map();

// ─── Redis backplane ──────────────────────────────────────────────────────────

// Subscribe once; handle all inbound cross-server messages
subscriber.subscribe(REDIS_CHANNEL, (err) => {
  if (err) console.error("[WS] Redis subscribe error", err);
  else console.log(`[WS] Subscribed to Redis channel: ${REDIS_CHANNEL}`);
});

subscriber.on("message", (channel, raw) => {
  if (channel !== REDIS_CHANNEL) return;

  try {
    const { roomId, senderId, payload } = JSON.parse(raw);
    broadcastToRoom(roomId, payload, senderId, false); // false = local only, no re-publish
  } catch (err) {
    console.error("[WS] Failed to parse Redis message", err);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/**
 * Broadcast to all sockets in a room.
 * @param {string} roomId
 * @param {object} payload
 * @param {string|null} excludeSocketId - skip this socket (the sender)
 * @param {boolean} publish - whether to also publish to Redis for other servers
 */
function broadcastToRoom(roomId, payload, excludeSocketId = null, publish = true) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const socketId of room) {
    if (socketId === excludeSocketId) continue;
    const ws = clients.get(socketId);
    if (ws) send(ws, payload);
  }

  if (publish) {
    publisher.publish(
      REDIS_CHANNEL,
      JSON.stringify({ roomId, senderId: excludeSocketId, payload })
    );
  }
}

function joinRoom(socketId, roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(socketId);
  console.log(`[WS] Socket ${socketId} joined room ${roomId}`);
}

function leaveAllRooms(socketId) {
  for (const [roomId, members] of rooms) {
    members.delete(socketId);
    if (members.size === 0) rooms.delete(roomId);
  }
}

// ─── Message handlers ─────────────────────────────────────────────────────────

/**
 * Route inbound WS messages by type.
 * All WebRTC signaling (offer, answer, ice-candidate) is just forwarded
 * to the correct room — the server never inspects the SDP payload.
 */
function handleMessage(socketId, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.warn("[WS] Non-JSON message from", socketId);
    return;
  }

  const { type, roomId, userId, payload } = msg;

  switch (type) {
    // Client identifies itself after connection
    case "identify": {
      socketUserMap.set(socketId, userId);
      console.log(`[WS] Socket ${socketId} identified as user ${userId}`);
      break;
    }

    // Join a match room (called after mutual match confirmed)
    case "join-room": {
      if (!roomId) return;
      joinRoom(socketId, roomId);
      send(clients.get(socketId), { type: "room-joined", roomId });
      break;
    }

    // ── WebRTC Signaling ─────────────────────────────────────────────────────
    // Server is a dumb relay — it never reads offer/answer/ICE content.
    case "webrtc-offer":
    case "webrtc-answer":
    case "webrtc-ice-candidate": {
      if (!roomId) return;
      broadcastToRoom(roomId, { type, payload }, socketId);
      break;
    }

    // Generic chat message within a match room
    case "chat-message": {
      if (!roomId) return;
      broadcastToRoom(roomId, {
        type: "chat-message",
        from: socketUserMap.get(socketId),
        payload,
        ts: Date.now(),
      }, socketId);
      break;
    }

    default:
      console.warn(`[WS] Unknown message type: ${type}`);
  }
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

function setupHeartbeat(wss) {
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        console.log("[WS] Terminating zombie connection");
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(interval));
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Attach the WebSocket server to an existing HTTP server.
 * Arcjet WS upgrade protection is applied in index.js before this runs.
 *
 * @param {import('http').Server} httpServer
 */
export function createWebSocketServer(httpServer) {
  // noServer: true — we handle the HTTP upgrade event manually in index.js
  // so Arcjet protection runs before the WS handshake completes.
  const wss = new WebSocketServer({ noServer: true });

  setupHeartbeat(wss);

  wss.on("connection", (ws, req) => {
    const socketId = uuidv4();
    ws.isAlive = true;
    clients.set(socketId, ws);

    console.log(`[WS] New connection: ${socketId} from ${req.socket.remoteAddress}`);

    // Acknowledge connection
    send(ws, { type: "connected", socketId });

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (data) => {
      handleMessage(socketId, data.toString());
    });

    ws.on("close", (code, reason) => {
      console.log(`[WS] Socket ${socketId} closed: ${code} ${reason}`);
      clients.delete(socketId);
      socketUserMap.delete(socketId);
      leaveAllRooms(socketId);
    });

    ws.on("error", (err) => {
      console.error(`[WS] Socket ${socketId} error`, err);
    });
  });

  wss.on("error", (err) => {
    console.error("[WS] Server error", err);
  });

  console.log("[WS] WebSocket server ready on /ws");
  return wss;
}
