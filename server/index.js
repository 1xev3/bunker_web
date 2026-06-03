const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const { sessions, rooms } = require('./state');
const setupApiRoutes = require('./routes/api');
const setupWebSocket = require('./ws/connection');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

setupApiRoutes(app);
setupWebSocket(wss);

setInterval(() => {
  sessions.cleanup();
  const hour = 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.status === 'finished' || Date.now() - room.lastActivity > 3 * hour) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3001;
const IS_DEV = process.env.NODE_ENV !== 'production';

let eaddrinuseRetries = 0;
const MAX_EADDRINUSE_RETRIES = 20; // ~10s total with the backoff below
function handleStartupError(error) {
  if (error?.code === 'EADDRINUSE') {
    // On a `--watch` restart the replacement process can boot before the old one
    // (which shuts down gracefully below) releases the socket. On Windows this is
    // worse: saving several files at once fires back-to-back restarts, and the OS
    // can hold the socket in TIME_WAIT for a second or more. Retry persistently
    // with a small backoff so the rebind succeeds as soon as the port frees,
    // rather than giving up after a fraction of a second. Only a genuinely
    // foreign process holding the port for the whole window bails out.
    if (IS_DEV && eaddrinuseRetries < MAX_EADDRINUSE_RETRIES) {
      eaddrinuseRetries += 1;
      const delay = Math.min(250 + eaddrinuseRetries * 100, 750);
      setTimeout(() => { try { server.close(); } catch {} server.listen(PORT); }, delay);
      return;
    }
    console.error(`Port ${PORT} is already in use by another process. Free it and restart, or start with a different PORT.`);
    console.error(`  Windows (PowerShell): Get-NetTCPConnection -LocalPort ${PORT} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`);
    console.error(`  Linux/macOS:          lsof -ti tcp:${PORT} | xargs kill -9`);
    process.exit(1);
  }

  console.error('Server failed to start:', error);
  process.exit(1);
}

server.on('error', (error) => {
  handleStartupError(error);
});

wss.on('error', (error) => {
  handleStartupError(error);
});

// On a `--watch` restart (or Ctrl-C) Node signals this process to exit. Open
// WebSocket connections keep `server.close()` from completing, which is exactly
// how the old process lingers as a zombie still holding the port. Terminate
// sockets, close the server, and hard-exit on a short deadline so the port is
// always freed before the replacement process tries to bind.
function shutdown() {
  for (const ws of wss.clients) {
    try { ws.terminate(); } catch { /* ignore */ }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// The WebSocket message listener is async, so a throw inside a handler surfaces
// as an unhandled rejection — which by default would terminate the process and
// drop every connected player (they'd all see "Переподключение"). Per-message
// handling is already wrapped in try/catch in ws/connection.js; these are the
// last-resort nets so an unforeseen async error logs instead of crashing the
// server. (Startup errors still exit via handleStartupError above.)
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (kept alive):', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception (kept alive):', error);
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
