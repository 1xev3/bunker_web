# CLAUDE.md

This file provides guidance to LLM when working with code in this repository.

## Project Overview

Web-based multiplayer "Bunker" game - a social deduction game where players with randomly generated characters negotiate who should survive in a bunker. Includes voting elimination, profession abilities, and procedural bunker grid.

**Stack**: React 19 + TypeScript + Vite + Tailwind (client) | Node.js + Express + WebSocket (server)

## Commands

```bash
npm run dev      # Dev mode: server (localhost:3001) + client (localhost:5173)
npm run build    # Build client for production
npm start        # Production server (serves client/dist)

cd client
npm run lint     # Lint client code
```

## Architecture

### Server (server/)

- **index.js**: Main entry - WebSocket handlers, game actions, room management
- **game/gameRoom.js**: Room state, player list, voting logic, status (waiting/running/finished)
- **game/player.js**: Character generation (10 attributes: gender, body, profession, health, hobby, phobia, inventory, backpack, additional, trait)
- **game/bunker.js**: Procedural 5x5 grid generation with frontier expansion from center
- **game/gameConfig.js**: Pack system - loads/validates JSON configs from `configurations/[PackName]/`
- **game/professionAbilities.js**: Ability execution (effects: set/randomize/swap/steal/reveal attributes, adjust food)
- **sessionManager.js**: Token-based reconnection
- **wsManager.js**: Connection tracking and broadcasting

### Configuration Packs

Modular system in `server/game/configurations/[PackName]/`:
- **People.json**: Character generation data (weighted tables for genders, ages, body types, health states, etc.)
- **Inventory.json**: Items and backpack contents
- **Bunker.json**: Themes, sizes, durations, food, items, room counts
- **Professions.json**: Abilities with targetType (none/self/other/pair), effects, and variants

Packs are validated on load; invalid packs are filtered out with detailed error reporting.

### Client (client/src/)

- **App.tsx**: WebSocket management, auto-reconnect, screen routing (Welcome → Lobby → BunkerIntro → GameRoom)
- **hooks/useGameState.ts**: Central room state management
- **types/game.ts**: Shared TypeScript types for all game entities and messages
- **components/**: WelcomeScreen, GameLobby, BunkerIntroScreen, GameRoom, CharacterCard, BunkerMap, VotingModal, AdminPanel

### WebSocket Protocol (`/ws`)

**Client → Server**: join, rejoin, start_game, reveal_attribute, reveal_all, start_voting, submit_vote, end_game, kick_player, use_profession_ability

**Server → Client**: room_state, joined, error, attribute_revealed, vote_confirmed, voting_result, game_ended, player_disconnected, player_reconnected, admin_changed, profession_ability_used

Session token stored in localStorage for auto-reconnection on disconnect.

## Key Mechanics

### Game Flow
1. **Waiting**: Join via code or create room → Admin starts when ready
2. **Running**: Characters generated → Players reveal attributes, use abilities, discuss elimination
3. **Voting**: Admin triggers vote → All active players vote once → Highest votes eliminated (ties = no elimination)
4. **Finished**: Game ends when ≤1 active player or admin manually ends

### State Management
- Server: Single source of truth in `Map<roomCode, GameRoom>`
- WsManager: Separate connection tracking `Map<roomCode, Map<playerId, ws>>`
- Client: Receives viewer-filtered state snapshots (only own unrevealed attributes visible)
- Admin transfer: 8-second grace period on disconnect before reassigning to next connected player

### Profession Abilities
Defined in Professions.json with targetType (none/self/other/pair), allowSelf flag, and effect/variants.
Effect types: add_to_backpack, set/randomize/swap/steal/strip/inspect/reveal_attribute, adjust_food.
Server validates, executes, and broadcasts public/private messages.

### Bunker Grid
Procedural 5x5 generation: center (2,2) entrance → frontier expansion → room count from config → items distributed randomly (0-33% rooms empty).

## Implementation Notes

- Server-authoritative: client sends intents, server validates/broadcasts
- Room cleanup every 30min (removes finished or >3hr inactive rooms)
- Character height uses Gaussian distribution, other attributes use weighted random
- Dev mode: Set `DEV_MIN_PLAYERS` env var to auto-fill rooms with bots (default: 2, max: 15)
- Client proxies `/api` and `/ws` to localhost:3001 during dev (vite.config.ts)
