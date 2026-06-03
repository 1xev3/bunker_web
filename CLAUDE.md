# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web-based multiplayer "Bunker" game — a social deduction game where players with randomly generated characters negotiate who survives in a bunker. Includes voting elimination, profession abilities, a procedural bunker grid, and a post-vote "bunker life" phase driven by scripted events.

**Stack**: React 19 + TypeScript + Vite + Tailwind v4 (client) | Node.js + Express + `ws` WebSocket (server). Server is CommonJS; client is ESM.

## Commands

```bash
npm run dev      # Dev: server (localhost:3001) + client (localhost:5173) via concurrently
npm run build    # Build client into client/dist (tsc -b && vite build)
npm start        # Production server; serves client/dist when NODE_ENV=production

cd client
npm run lint     # ESLint over client code
```

No test suite or test runner is configured.

## Architecture

### Server (`server/`) — authoritative game state
- **Transport**: HTTP API (`routes/api.js`) for read-only pack/room queries; all gameplay flows over a single WebSocket at `/ws`.
- **`state.js`**: process-wide singletons — `rooms` (Map of roomCode → `GameRoom`), `sessions` (`SessionManager` for rejoin tokens), `wsManager`, `pendingAdminTransfers`. In-memory only; no DB. Rooms are GC'd when empty, finished, or idle >3h (`index.js` interval).
- **`ws/connection.js`**: connection lifecycle + message router. A client must send `join` or `rejoin` before any other message. Each message `type` maps to a handler in `ws/gameHandlers.js` (lobby/voting/profession) or `ws/bunkerLifeHandlers.js` (event phase). On admin disconnect, admin is transferred after an 8s grace period.
- **`wsManager.js`**: roomCode → (playerId → ws) registry. Use `broadcast`, `broadcastExcept`, `send`, and `broadcastState` (sends per-player `toDict(playerId)` so each player sees only what they should).
- **`game/entities/`**: `GameRoom` (status `waiting | running | bunker_life | finished`, holds players/bunker/votes/event state), `Player`, `Bunker`.
- **`game/config/`**: configuration "pack" loading & validation. `loader.js` reads a pack directory, `structuredConfig.js`/`settings.js` normalize it, `validator.js` validates, `yamlEvents.js` parses the events.

### Configuration packs (`server/game/configurations/<PackName>/`)
A pack is a directory of YAML (or JSON) files: `People`, `Inventory`, `Bunker`, `Professions` (required), plus optional `Pack.yaml` (meta: name/author/color) and an `Events/` directory (`_settings.yaml` + one YAML per event). Invalid packs are logged and skipped; `DefaultPack` is preferred as default, else the first valid pack alphabetically. The "Fantasy" pack is the reference example.

**Events** are declarative YAML (the previous Lua engine was removed — do not reintroduce it): flavor/choice events with options→outcomes, participants, and chains. See `memory` notes and existing `Events/*.yaml` for the schema.

### Client (`client/src/`)
- **`App.tsx`**: tiny pushState router — `/` is the game, `/packs/:id/edit` is the pack editor.
- **`GameApp.tsx`** + **`hooks/useGameState.ts`**: WebSocket connection and a reducer over `RoomState`. Server `room_state` messages replace state wholesale (`SET_STATE`); granular messages (attr reveal, voting result, admin change) patch it.
- **`types/game.ts`**: shared message/state types — keep in sync with server message shapes.
- **`components/`**: screen-per-phase UI (lobby, game room, voting, bunker life, event cards under `components/event/`).

### Conventions
- Server is the single source of truth; the client never computes game outcomes, only renders state and sends intents.
- Some user-facing strings and validation messages are in Russian — match the surrounding language.
