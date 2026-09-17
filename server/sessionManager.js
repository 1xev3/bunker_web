const { randomUUID } = require('crypto');

const TTL_MS = 24 * 60 * 60 * 1000;

class SessionManager {
  constructor() {
    this._sessions = new Map(); // token -> { playerId, roomCode, lastSeen }
  }

  create(playerId, roomCode) {
    const token = randomUUID();
    this._sessions.set(token, { playerId, roomCode, lastSeen: Date.now() });
    return token;
  }

  get(token) {
    const s = this._sessions.get(token);
    if (!s) return null;
    if (Date.now() - s.lastSeen > TTL_MS) {
      this._sessions.delete(token);
      return null;
    }
    s.lastSeen = Date.now();
    return s;
  }

  delete(token) {
    return this._sessions.delete(token);
  }

  deleteForPlayer(playerId, roomCode) {
    for (const [token, session] of this._sessions) {
      if (session.playerId === playerId && session.roomCode === roomCode) {
        this._sessions.delete(token);
      }
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [token, s] of this._sessions) {
      if (now - s.lastSeen > TTL_MS) this._sessions.delete(token);
    }
  }
}

module.exports = SessionManager;
