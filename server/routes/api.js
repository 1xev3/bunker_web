const { rooms, wsManager } = require('../state');
const { loadPack, listPacks, getDefaultPackName, getPackStats } = require('../game/gameConfig');

function setupApiRoutes(app) {
  app.get('/api/config', (req, res) => {
    try {
      res.json(loadPack(req.query.pack || getDefaultPackName()));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/packs', (_req, res) => {
    res.json(listPacks());
  });

  app.get('/api/packs/:id/meta', (req, res) => {
    const pack = listPacks().find((p) => p.id === req.params.id);
    if (!pack) return res.status(404).json({ error: 'Pack not found' });
    res.json(pack.meta);
  });

  app.get('/api/packs/:id/stats', (req, res) => {
    try {
      res.json(getPackStats(req.params.id));
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  app.get('/api/rooms', (_req, res) => {
    const list = [];
    for (const [code, room] of rooms) {
      if (room.status !== 'finished') {
        list.push({
          room_code: code,
          player_count: room.players.length,
          status: room.status,
          spectator_count: wsManager.spectatorCount(code),
        });
      }
    }
    res.json(list);
  });

  app.get('/api/rooms/:code', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ room_code: room.roomCode, player_count: room.players.length, status: room.status });
  });
}

module.exports = setupApiRoutes;
