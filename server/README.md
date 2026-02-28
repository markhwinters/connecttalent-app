# Connect-Talent Server — Setup Guide

## Stack
- **Express.js** — REST API
- **PostgreSQL + Drizzle ORM** — Database & migrations
- **WebSockets (ws)** — Real-time signaling
- **Redis (ioredis)** — Pub/Sub backplane for multi-server scaling
- **Arcjet** — Rate limiting, bot protection, shield
- **WebRTC** — P2P file transfer (signaled via WS, no server relay)

---

## Prerequisites

- Node.js 20+
- PostgreSQL running locally or via a hosted service (Neon, Supabase, etc.)
- Redis running locally or via Upstash / Redis Cloud
- Arcjet account (free tier works for dev)

---

## Quick Start

```bash
cd server
cp .env.example .env       # fill in your values
npm install
npm run db:generate        # generate SQL migrations from schema
npm run db:migrate         # apply migrations to your DB
npm run dev                # start with --watch (auto-restarts)
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default 3001) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ARCJET_KEY` | Your Arcjet API key (from app.arcjet.com) |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins for CORS |

---

## API Endpoints

| Method | Path | Description | Rate Limit |
|---|---|---|---|
| GET | /api/health | Health check | None |
| POST | /api/users | Create user | 30/min |
| GET | /api/users/:id | Get user | None |
| PATCH | /api/users/:id/keywords | Update keywords | 30/min |
| GET | /api/discover/:userId | Find keyword matches | None |
| POST | /api/swipe | Swipe on a user | 20/min |
| GET | /api/matches/:userId | Get mutual matches | None |

---

## WebSocket Protocol

Connect to: `ws://localhost:3001/ws`

### Message Types (client → server)

```json
{ "type": "identify", "userId": "<uuid>" }
{ "type": "join-room", "roomId": "<matchId>" }
{ "type": "webrtc-offer", "roomId": "<matchId>", "payload": { ...sdp } }
{ "type": "webrtc-answer", "roomId": "<matchId>", "payload": { ...sdp } }
{ "type": "webrtc-ice-candidate", "roomId": "<matchId>", "payload": { ...candidate } }
{ "type": "chat-message", "roomId": "<matchId>", "payload": { "text": "hello" } }
```

### Message Types (server → client)

```json
{ "type": "connected", "socketId": "<uuid>" }
{ "type": "room-joined", "roomId": "<matchId>" }
{ "type": "webrtc-offer", "payload": { ...sdp } }
{ "type": "webrtc-answer", "payload": { ...sdp } }
{ "type": "webrtc-ice-candidate", "payload": { ...candidate } }
{ "type": "chat-message", "from": "<userId>", "payload": { "text": "hello" }, "ts": 1234567890 }
```

---

## WebRTC Flow

1. Mutual match is confirmed (POST /api/swipe returns `{ mutual: true }`)
2. Both clients call `join-room` with the `match.id`
3. Initiator sends `webrtc-offer` → server relays to room
4. Receiver sends `webrtc-answer` → server relays to room
5. Both exchange `webrtc-ice-candidate` messages
6. Direct P2P DataChannel established — files transfer without server involvement

---

## Project Structure

```
server/
├── src/
│   ├── index.js          # Entry point: Express + HTTP + WS server
│   ├── db/
│   │   ├── client.js     # Drizzle + pg Pool singleton
│   │   └── schema.js     # Users, Matches tables + relations
│   ├── ws/
│   │   └── server.js     # WebSocket server, rooms, heartbeat, Redis backplane
│   ├── routes/
│   │   └── api.js        # All REST routes
│   ├── middleware/
│   │   └── arcjet.js     # Arcjet rule sets + Express middleware factory
│   └── lib/
│       ├── redis.js      # Redis pub/sub + main client
│       └── matching.js   # Keyword intersection query
├── drizzle/              # Generated migrations (git-commit these)
├── drizzle.config.js
├── package.json
└── .env.example
```
