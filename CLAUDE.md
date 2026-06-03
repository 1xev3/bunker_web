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

Try to not 