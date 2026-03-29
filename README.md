# Multiplayer Tic-Tac-Toe with Nakama Backend

A production-ready, multiplayer Tic-Tac-Toe game with **server-authoritative architecture** using [Nakama](https://heroiclabs.com/nakama/) as the backend infrastructure.

## Features

### Core
- **Server-Authoritative Game Logic** - All game state managed on the server; every move validated server-side before applying
- **Real-Time Multiplayer** - WebSocket-based communication for instant game state updates
- **Matchmaking System** - Automatic match finding via RPC; players are paired in real-time
- **Anti-Cheat** - Client cannot manipulate game state; server rejects invalid moves

### Bonus Features
- **Concurrent Game Support** - Multiple simultaneous matches with isolated game rooms
- **Leaderboard System** - Global ranking with W/L/D stats, win streaks, and scores persisted via Nakama storage
- **Timer-Based Game Mode** - 30-second turn timer with automatic forfeit on timeout; selectable at match start (classic vs. timed)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI Components | shadcn/ui (Radix UI) + Tailwind CSS |
| State Management | Zustand |
| Realtime Client | @heroiclabs/nakama-js |
| Backend | Nakama Server (TypeScript runtime) |
| Database | CockroachDB (via Nakama) |
| Deployment | Docker Compose |

## Architecture & Design Decisions

### Server-Authoritative Match Handler

The game uses Nakama's **authoritative multiplayer match** system. The server:

1. **Owns all game state** - Board, turns, timer, and win detection run server-side
2. **Validates every move** - Checks turn order, cell availability, and position bounds
3. **Broadcasts state** - After each valid move, the updated state is pushed to all connected clients
4. **Manages timers** - For timed mode, the server tracks deadlines and auto-forfeits on timeout

```
Client A                    Nakama Server                   Client B
   |                             |                             |
   |-- MOVE {position: 4} ----->|                             |
   |                             |-- validate move             |
   |                             |-- update board              |
   |                             |-- check winner              |
   |<-- STATE_UPDATE -----------|-- STATE_UPDATE ------------->|
   |                             |                             |
```

### OpCodes

| Code | Name | Direction | Description |
|------|------|-----------|-------------|
| 1 | MOVE | Client -> Server | Player sends move `{position: 0-8}` |
| 2 | STATE_UPDATE | Server -> Client | Full game state broadcast |
| 3 | GAME_OVER | Server -> Client | Game result with winner/draw |
| 4 | MATCH_READY | Server -> Client | Both players joined, game starts |
| 5 | OPPONENT_LEFT | Server -> Client | Opponent disconnected |

### Matchmaking Flow

1. Client calls `find_match` RPC with `{mode: "classic"|"timed"}`
2. Server searches for open matches with matching mode
3. If found, returns existing match ID; otherwise creates a new match
4. Client joins the match via WebSocket
5. When 2 players are in the match, server broadcasts `MATCH_READY`

### Leaderboard & Stats

- **Nakama Leaderboard** - Incremental score tracking (win: +200, draw: +25)
- **Player Stats Storage** - Detailed W/L/D/streak stats stored in Nakama's storage engine
- **Public Read** - Stats are publicly readable for the leaderboard display

## Setup & Installation

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker](https://www.docker.com/) & Docker Compose
- npm or yarn

### 1. Clone the Repository

```bash
git clone <repository-url>
cd tic-tac-toe
```

### 2. Start Nakama Server

```bash
cd nakama

# Install dependencies and build server modules
npm install
npm run build

# Start Nakama + CockroachDB via Docker
docker-compose up -d
```

Nakama will be available at:
- **Game API**: http://localhost:7350
- **Admin Console**: http://localhost:7351 (login: admin / password)
- **gRPC**: localhost:7349

### 3. Start Frontend

```bash
# From the project root (not nakama/)
npm install
npm run dev
```

The game will be available at **http://localhost:8080**

### 4. Environment Configuration

Create a `.env` file in the project root (one is provided by default):

```env
VITE_NAKAMA_HOST=127.0.0.1
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_KEY=defaultkey
VITE_NAKAMA_SSL=false
```

For production deployment, update these to point to your deployed Nakama server.

## Deployment

### Deploying Nakama Server (Cloud)

#### Option A: Docker on a VPS (DigitalOcean, AWS EC2, etc.)

1. SSH into your server
2. Install Docker & Docker Compose
3. Copy the `nakama/` directory to the server
4. Update `docker-compose.yml` ports if needed
5. Build and run:

```bash
cd nakama
npm install && npm run build
docker-compose up -d
```

6. Configure firewall to expose ports 7350 (API) and 7351 (console)

#### Option B: Heroic Cloud

Deploy directly to [Heroic Cloud](https://heroiclabs.com/heroic-cloud/) - Nakama's managed hosting:

1. Create a Heroic Cloud account
2. Upload the `nakama/build/index.js` as your server runtime
3. Configure the runtime settings in the dashboard

### Deploying Frontend

#### Vercel / Netlify

1. Set the build command: `npm run build`
2. Set the output directory: `dist`
3. Add environment variables:
   - `VITE_NAKAMA_HOST` = your-nakama-server.com
   - `VITE_NAKAMA_PORT` = 7350
   - `VITE_NAKAMA_KEY` = your-server-key
   - `VITE_NAKAMA_SSL` = true

#### Static Hosting

```bash
npm run build
# Upload the dist/ folder to any static hosting (S3, Cloudflare Pages, etc.)
```

## API / Server Configuration

### Nakama Server Config (`nakama/local.yml`)

```yaml
logger:
  level: "DEBUG"        # Set to "INFO" for production

session:
  token_expiry_sec: 7200  # 2 hour sessions

socket:
  server_key: "defaultkey"  # Change in production!

runtime:
  js_entrypoint: "build/index.js"

console:
  username: "admin"     # Change in production!
  password: "password"  # Change in production!
```

### Registered RPCs

| RPC | Payload | Response | Description |
|-----|---------|----------|-------------|
| `find_match` | `{mode: "classic"\|"timed"}` | `{matchId: string}` | Find or create a match |
| `get_player_stats` | `{}` | `{wins, losses, draws, streak, score}` | Get authenticated player's stats |
| `get_leaderboard` | `{}` | `{records: LeaderboardEntry[]}` | Get top 20 players |

## Testing Multiplayer

### Local Testing (2 Browser Windows)

1. Start the Nakama server and frontend as described above
2. Open **http://localhost:8080** in two separate browser windows (or incognito)
3. Enter different nicknames in each window
4. Select the same game mode (classic or timed) in both
5. Click "Continue" in both - they will be matched together
6. Play the game! Moves appear in real-time on both screens

### Verify Server Authority

1. Open browser DevTools (F12) in one window
2. Try modifying the game state in the console - changes won't persist
3. Only moves sent through the Nakama socket and validated by the server are applied

## Project Structure

```
tic-tac-toe/
├── src/
│   ├── components/game/
│   │   ├── GameBoard.tsx          # Game board UI with marks, timer, results
│   │   ├── Leaderboard.tsx        # Global leaderboard display
│   │   ├── MatchmakingScreen.tsx  # Waiting for opponent screen
│   │   └── NicknameScreen.tsx     # Nickname input + mode selection
│   ├── lib/
│   │   ├── nakama.ts              # Nakama client wrapper (auth, socket, RPCs)
│   │   └── utils.ts
│   ├── store/
│   │   └── gameStore.ts           # Zustand store with Nakama integration
│   ├── pages/
│   │   └── Index.tsx              # Main page routing by game status
│   └── App.tsx
├── nakama/
│   ├── src/
│   │   └── main.ts               # Server-side match handler, RPCs, leaderboard
│   ├── build/
│   │   └── index.js               # Compiled server module (loaded by Nakama)
│   ├── docker-compose.yml         # Nakama + CockroachDB containers
│   ├── local.yml                  # Nakama server configuration
│   ├── rollup.config.mjs          # Build config for server TypeScript
│   └── package.json
├── .env                           # Nakama connection settings
└── package.json
```
