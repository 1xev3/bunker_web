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
function handleStartupError(error) {
  if (error?.code === 'EADDRINUSE') {
    // In dev, `node --watch` restarts the process whenever a watched file
    // changes — and it watches every file the server reads, including the
    // config YAMLs. The replacement process can boot before the old one has
    // released the socket, so don't die on the first clash: retry a few times.
    if (IS_DEV && eaddrinuseRetries < 10) {
      eaddrinuseRetries += 1;
      console.error(`Port ${PORT} busy (likely the previous --watch process exiting), retry ${eaddrinuseRetries}/10 in 500ms...`);
      setTimeout(() => { try { server.close(); } catch {} server.listen(PORT); }, 500);
      return;
    }
    console.error(`Port ${PORT} is already in use. Stop the existing server or start with a different PORT.`);
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

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
