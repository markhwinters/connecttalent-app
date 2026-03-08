# ConnectTalent Server — Ephemeral Edition

An ephemeral networking platform inspired by **Snapchat's self-destructing model**. User sessions, matches, and chat messages all have a limited lifespan — nothing persists forever.

## Stack

- **Express.js** — REST API
- **PostgreSQL + Drizzle ORM** — Database with TTL-based expiration
- **WebSockets (ws)** — Real-time signaling + ephemeral chat
- **Redis** — Pub/Sub backplane + online status tracking
- **Arcjet** — Rate limiting, bot protection, shield
- **WebRTC** — P2P file transfer (signaled via WS, no server relay)

---

## Ephemerality Model

| Concept        | TTL            | Behavior                                        |
| -------------- | -------------- | ----------------------------------------------- |
| User sessions  | 24 hours       | Auto-expire; extend via heartbeat               |
| Pending swipes | 1 hour         | Self-destruct if not reciprocated               |
| Mutual matches | 24 hours       | Expire after the connection window              |
| Chat messages  | Real-time only | Relay-only, never stored server-side            |
| Online status  | 2 minutes      | Auto-expire in Redis, refreshed by WS heartbeat |

A cleanup job runs every **15 minutes** to purge expired rows.

---

## Prerequisites

- Node.js 20+
- PostgreSQL (local or hosted: Neon, Supabase, etc.)
- Redis (local or hosted: Upstash, Redis Cloud, etc.)
- Arcjet account (free tier for dev)

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

| Variable          | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `PORT`            | HTTP port (default 3001)                                   |
| `DATABASE_URL`    | PostgreSQL connection string                               |
| `REDIS_URL`       | Redis connection URL (supports `redis://` and `rediss://`) |
| `ARCJET_KEY`      | Your Arcjet API key                                        |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins for CORS                  |

---

## API Endpoints

| Method | Path                   | Description                  | Rate Limit |
| ------ | ---------------------- | ---------------------------- | ---------- |
| GET    | /api/health            | Health check                 | None       |
| POST   | /api/users             | Join session (ephemeral)     | 30/min     |
| GET    | /api/users/:id         | Get user (if not expired)    | None       |
| PATCH  | /api/users/:id         | Update profile + refresh TTL | 30/min     |
| DELETE | /api/users/:id         | Self-destruct session        | None       |
| POST   | /api/heartbeat/:userId | Keep session alive           | None       |
| GET    | /api/discover/:userId  | Find keyword matches         | None       |
| POST   | /api/swipe             | Swipe (ephemeral match)      | 20/min     |

---

## WebSocket Protocol

Connect to: `ws://localhost:3001/ws`

### Client → Server

```json
{ "type": "identify", "userId": "<uuid>" }
{ "type": "join-room", "roomId": "<matchId>" }
{ "type": "webrtc-offer", "roomId": "<matchId>", "payload": { ...sdp } }
{ "type": "webrtc-answer", "roomId": "<matchId>", "payload": { ...sdp } }
{ "type": "webrtc-ice-candidate", "roomId": "<matchId>", "payload": { ...candidate } }
{ "type": "chat-message", "roomId": "<matchId>", "payload": { "text": "hello" } }
```

### Server → Client

```json
{ "type": "connected", "socketId": "<uuid>" }
{ "type": "room-joined", "roomId": "<matchId>" }
{ "type": "webrtc-offer", "payload": { ...sdp } }
{ "type": "webrtc-answer", "payload": { ...sdp } }
{ "type": "webrtc-ice-candidate", "payload": { ...candidate } }
{ "type": "chat-message", "from": "<userId>", "payload": { "text": "hello" }, "ts": 1234567890 }
{ "type": "match-notify", "matchId": "<uuid>", "withUser": "<userId>" }
```

---

## Project Structure

```
server/
├── src/
│   ├── index.js          # Entry point + ephemeral cleanup scheduler
│   ├── db/
│   │   ├── client.js     # Drizzle + pg Pool singleton
│   │   └── schema.js     # Users, Matches with TTL + expiration constants
│   ├── ws/
│   │   └── server.js     # WebSocket server, rooms, online status, push notifications
│   ├── routes/
│   │   └── api.js        # REST routes (ephemeral sessions, heartbeat, self-destruct)
│   ├── middleware/
│   │   └── arcjet.js     # Arcjet rule sets + Express middleware factory
│   └── lib/
│       ├── redis.js      # Redis clients + ephemeral state helpers (online status)
│       └── matching.js   # Keyword intersection query (filters expired users)
├── package.json
└── .env.example
```
