# Repository Guidelines

## Project Structure & Module Organization

The authoritative Node.js game server lives in `server/`. HTTP routes are under `server/routes/`, WebSocket handlers under `server/ws/`, and game entities, rules, and pack loading under `server/game/`. The React 19 and TypeScript client lives in `client/src/`; organize UI by feature beneath `components/`, shared state logic in `hooks/`, and message shapes in `types/game.ts`. Static browser assets belong in `client/public/`. Game content is YAML plus images under `server/game/configurations/<PackName>/`. Server tests live in `test/`.

Keep game outcomes on the server. When server message shapes change, update the matching client types and consumers.

## Build, Test, and Development Commands

Install both dependency sets with `npm ci` and `npm --prefix client ci`.

- `npm run dev` starts the server on port 3001 and Vite on port 5173 with watch mode.
- `npm test` runs all `test/*.test.js` files with Node's built-in test runner.
- `npm run build` type-checks and builds the client into `client/dist/`.
- `npm --prefix client run lint` checks TypeScript and React code with ESLint.
- `npm start` runs the production server; set `NODE_ENV=production` to serve the built client.

## Coding Style & Naming Conventions

Follow existing files: two-space indentation, semicolons, single quotes, and trailing commas in multiline JavaScript/TypeScript. Use `camelCase` for functions and variables, `PascalCase` for React components and classes, and `useCamelCase` for hooks. Keep the server in CommonJS (`require`/`module.exports`) and the client in ESM. Match nearby Russian user-facing text where applicable. Prefer small feature-local helpers over new abstraction layers.

## Testing Guidelines

Use `node:test` with `node:assert/strict`. Name files `<feature>.test.js` and write behavior-focused test names. Add or update a focused regression test for server rules, WebSocket flows, configuration parsing, and AI-provider changes. Run tests, lint, and the client build before opening a pull request. No coverage threshold is currently enforced.

## Commit & Pull Request Guidelines

Recent commits use short, descriptive summaries such as `Fix deploy` and `Added item categories`; no prefix convention is enforced. Prefer a concise imperative summary that names one logical change. Pull requests should explain the behavior change, list verification commands, link relevant issues, and include screenshots for visible UI changes. Call out configuration-schema or environment-variable changes explicitly.

## Security & Configuration

Copy `.env.example` for local AI-provider settings. Never commit `.env`, API keys, rejoin tokens, or provider credentials. Validate new YAML pack data through the existing loader rather than trusting configuration input.
