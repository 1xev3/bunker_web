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
function handleStartupError(error) {
  if (error?.code === 'EADDRINUSE') {
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

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
