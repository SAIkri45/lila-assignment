# Backend Developer Assignment Submission
**Name:** SAGADABOINA SAI KRISHNA
**Role Applied:** Backend Developer
**GitHub Repository:** https://github.com/SAIkri45/lila-assignment
**Live Demo (Frontend):** https://lila-assignment.pages.dev/

---

## Project: Multiplayer Tic-Tac-Toe with Nakama Backend

A production-ready, real-time multiplayer Tic-Tac-Toe game built with a **server-authoritative architecture** using Nakama as the backend game server.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui (Radix UI) + Tailwind CSS |
| State Management | Zustand |
| Realtime Client | @heroiclabs/nakama-js |
| Backend | Nakama Server (TypeScript runtime) |
| Database | CockroachDB (via Nakama) |
| Deployment | Docker Compose (backend) + Cloudflare Pages (frontend) |

---

## Features Implemented

### Core Requirements
- **Server-Authoritative Game Logic** — All game state (board, turns, win detection) is owned and validated by the Nakama server. Clients cannot manipulate state.
- **Real-Time Multiplayer** — WebSocket-based communication via Nakama sockets for instant, bidirectional game state updates.
- **Matchmaking System** — `find_match` RPC automatically pairs players; finds open matches or creates new ones.
- **Anti-Cheat** — Server rejects moves that are out-of-turn, target occupied cells, or have invalid positions.

### Bonus Features
- **Concurrent Game Support** — Multiple simultaneous matches with fully isolated game rooms (each match has its own state).
- **Leaderboard System** — Global ranking persisted in Nakama storage. Win: +200 pts, Draw: +25 pts, Loss: -50 pts. Top 20 players displayed.
- **Win Streak Tracking** — Per-player streak counter reset on loss/draw.
- **Timer-Based Game Mode** — 30-second per-turn timer (selectable at match start). Server auto-forfeits the player on timeout.

---

## Architecture

### Server-Authoritative Flow

```
Client A                    Nakama Server                   Client B
   |                             |                             |
   |-- MOVE {position: 4} ----->|                             |
   |                             |-- validate turn order       |
   |                             |-- validate cell is empty    |
   |                             |-- apply move to board       |
   |                             |-- check for winner          |
   |<-- STATE_UPDATE -----------|-- STATE_UPDATE ------------->|
   |                             |                             |
```

### OpCodes (Client ↔ Server Protocol)

| Code | Name | Direction | Description |
|------|------|-----------|-------------|
| 1 | MOVE | Client → Server | Player sends move `{position: 0-8}` |
| 2 | STATE_UPDATE | Server → Client | Full game state broadcast |
| 3 | GAME_OVER | Server → Client | Game result with winner/draw/reason |
| 4 | MATCH_READY | Server → Client | Both players joined, game starts |
| 5 | OPPONENT_LEFT | Server → Client | Opponent disconnected — remaining player wins |

### RPC Endpoints

| RPC | Payload | Response |
|-----|---------|----------|
| `find_match` | `{mode: "classic" \| "timed"}` | `{matchId: string}` |
| `get_player_stats` | `{}` | `{wins, losses, draws, streak, score}` |
| `get_leaderboard` | `{}` | `{records: LeaderboardEntry[]}` |

### Matchmaking Flow
1. Client calls `find_match` RPC with chosen mode
2. Server lists open matches filtered by mode label
3. If an open match exists (0–1 players), returns its ID
4. Otherwise creates a new authoritative match
5. Client joins via WebSocket
6. When 2nd player joins, server broadcasts `MATCH_READY` and starts the game

---

## Project Structure

```
tic-tac-toe/
├── src/                          # React frontend
│   ├── components/game/
│   │   ├── GameBoard.tsx         # Board UI, timer display, results
│   │   ├── Leaderboard.tsx       # Global leaderboard
│   │   ├── MatchmakingScreen.tsx # Waiting for opponent
│   │   └── NicknameScreen.tsx    # Nickname input + mode selection
│   ├── lib/
│   │   └── nakama.ts             # Nakama client wrapper (auth, socket, RPCs)
│   ├── store/
│   │   └── gameStore.ts          # Zustand store + Nakama integration
│   └── pages/
│       └── Index.tsx             # Page routing by game status
├── nakama/                       # Backend (Nakama TypeScript runtime)
│   ├── src/
│   │   └── main.ts               # Match handler, RPCs, leaderboard logic
│   ├── build/
│   │   └── index.js              # Compiled server module
│   ├── docker-compose.yml        # Nakama + CockroachDB containers
│   └── local.yml                 # Nakama server config
└── package.json
```

---

## How to Run Locally

### Prerequisites
- Node.js v18+
- Docker & Docker Compose

### 1. Start Backend (Nakama Server)
```bash
cd nakama
npm install
npm run build
docker-compose up -d
```

Nakama will be available at:
- Game API: http://localhost:7350
- Admin Console: http://localhost:7351 (admin / password)

### 2. Start Frontend
```bash
# In project root
npm install
npm run dev
```

App runs at: http://localhost:8080

### 3. Test Multiplayer
Open http://localhost:8080 in **two separate browser windows** (or one in incognito), enter different nicknames, select the same mode, and click Continue. Both players are auto-matched.

---

## Key Design Decisions

### Why Nakama?
Nakama is purpose-built for game backends — it provides authoritative match handlers, built-in WebSocket transport, leaderboards, and persistent storage out of the box, making it ideal for a multiplayer game server.

### Why Server-Authoritative?
Prevents cheating entirely. Clients only send intent (move position); the server validates and applies all state changes. Clients receive the authoritative state via broadcast — they cannot fake moves.

### Timed Mode Implementation
The server tracks `turnDeadlineTick` (tick number when the turn expires). On every `matchLoop` tick, the server checks if `tick >= turnDeadlineTick`. If so, the current player forfeits and the opponent wins — no client involvement needed.

### Leaderboard Persistence
Nakama's storage engine persists player stats (`wins`, `losses`, `draws`, `streak`, `score`) server-side with `permissionWrite: 0` (server-only). The leaderboard is backed by Nakama's native leaderboard system with incremental score operator.

---

## Links

- **GitHub:** https://github.com/SAIkri45/lila-assignment
- **Live Demo:** https://lila-assignment.pages.dev/
