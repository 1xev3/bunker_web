class WsManager {
  constructor() {
    // roomCode -> Map<playerId, ws>
    this._rooms = new Map();
    // roomCode -> Map<spectatorId, ws> — read-only watchers, separate from
    // players so they never count toward admin transfer or gameplay.
    this._spectators = new Map();
  }

  _getRoom(roomCode) {
    if (!this._rooms.has(roomCode)) this._rooms.set(roomCode, new Map());
    return this._rooms.get(roomCode);
  }

  _getSpectators(roomCode) {
    if (!this._spectators.has(roomCode)) this._spectators.set(roomCode, new Map());
    return this._spectators.get(roomCode);
  }

  connect(roomCode, playerId, ws) {
    const room = this._getRoom(roomCode);
    const old = room.get(playerId);
    if (old && old.readyState === 1 /* OPEN */) {
      try { old.close(4001, 'superseded'); } catch {}
    }
    room.set(playerId, ws);
  }

  disconnect(roomCode, playerId) {
    this._rooms.get(roomCode)?.delete(playerId);
  }

  connectSpectator(roomCode, spectatorId, ws) {
    this._getSpectators(roomCode).set(spectatorId, ws);
  }

  disconnectSpectator(roomCode, spectatorId) {
    this._spectators.get(roomCode)?.delete(spectatorId);
  }

  spectatorCount(roomCode) {
    return this._spectators.get(roomCode)?.size ?? 0;
  }

  dropRoom(roomCode) {
    this._rooms.delete(roomCode);
    this._spectators.delete(roomCode);
  }

  send(roomCode, playerId, msg) {
    const ws = this._rooms.get(roomCode)?.get(playerId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  broadcast(roomCode, msg) {
    const raw = JSON.stringify(msg);
    const room = this._rooms.get(roomCode);
    if (room) {
      for (const ws of room.values()) {
        if (ws.readyState === 1) ws.send(raw);
      }
    }
    const spectators = this._spectators.get(roomCode);
    if (spectators) {
      for (const ws of spectators.values()) {
        if (ws.readyState === 1) ws.send(raw);
      }
    }
  }

  broadcastExcept(roomCode, excludedPlayerId, msg) {
    const raw = JSON.stringify(msg);
    const room = this._rooms.get(roomCode);
    if (room) {
      for (const [playerId, ws] of room) {
        if (playerId === excludedPlayerId) continue;
        if (ws.readyState === 1) ws.send(raw);
      }
    }
    const spectators = this._spectators.get(roomCode);
    if (spectators) {
      for (const ws of spectators.values()) {
        if (ws.readyState === 1) ws.send(raw);
      }
    }
  }

  broadcastState(roomCode, gameRoom) {
    const room = this._rooms.get(roomCode);
    if (room) {
      for (const [playerId, ws] of room) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'room_state', data: gameRoom.toDict(playerId) }));
        }
      }
    }
    // Spectators see only what is publicly revealed (viewerId = null).
    const spectators = this._spectators.get(roomCode);
    if (spectators && spectators.size > 0) {
      const raw = JSON.stringify({ type: 'room_state', data: gameRoom.toDict(null) });
      for (const ws of spectators.values()) {
        if (ws.readyState === 1) ws.send(raw);
      }
    }
  }

  getConnected(roomCode) {
    return new Set(this._rooms.get(roomCode)?.keys() ?? []);
  }

  isConnected(roomCode, playerId) {
    const ws = this._rooms.get(roomCode)?.get(playerId);
    return ws?.readyState === 1;
  }
}

module.exports = WsManager;
