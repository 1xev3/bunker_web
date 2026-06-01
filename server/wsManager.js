class WsManager {
  constructor() {
    // roomCode -> Map<playerId, ws>
    this._rooms = new Map();
  }

  _getRoom(roomCode) {
    if (!this._rooms.has(roomCode)) this._rooms.set(roomCode, new Map());
    return this._rooms.get(roomCode);
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

  send(roomCode, playerId, msg) {
    const ws = this._rooms.get(roomCode)?.get(playerId);
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  broadcast(roomCode, msg) {
    const room = this._rooms.get(roomCode);
    if (!room) return;
    const raw = JSON.stringify(msg);
    for (const ws of room.values()) {
      if (ws.readyState === 1) ws.send(raw);
    }
  }

  broadcastExcept(roomCode, excludedPlayerId, msg) {
    const room = this._rooms.get(roomCode);
    if (!room) return;
    const raw = JSON.stringify(msg);
    for (const [playerId, ws] of room) {
      if (playerId === excludedPlayerId) continue;
      if (ws.readyState === 1) ws.send(raw);
    }
  }

  broadcastState(roomCode, gameRoom) {
    const room = this._rooms.get(roomCode);
    if (!room) return;
    for (const [playerId, ws] of room) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'room_state', data: gameRoom.toDict(playerId) }));
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
