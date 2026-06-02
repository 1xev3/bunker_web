const { rooms, wsManager, pendingAdminTransfers } = require('../state');
const {
  handleJoin,
  handleRejoin,
  handleStartGame,
  handleRevealAttr,
  handleRevealAll,
  handleStartVoting,
  handleCancelVoting,
  handleVote,
  handleEndGame,
  handleKick,
  handleUseProfessionAbility,
  transferAdmin,
} = require('./gameHandlers');
const { handleConfirmBunkerLife, handleResolveEvent } = require('./bunkerLifeHandlers');

function setupWebSocket(wss) {
  wss.on('connection', (ws) => {
    let roomCode = null;
    let playerId = null;

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (!playerId) {
        if (msg.type === 'join') {
          let result = null;
          try {
            result = handleJoin(ws, msg);
          } catch (error) {
            ws.send(JSON.stringify({ type: 'error', message: error.message || 'Failed to join room' }));
            return;
          }
          if (!result) return ws.send(JSON.stringify({ type: 'error', message: 'Room not found or game already started' }));
          ({ roomCode, playerId } = result);
        } else if (msg.type === 'rejoin') {
          const result = handleRejoin(ws, msg);
          if (!result) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
            ws.close();
            return;
          }
          ({ roomCode, playerId } = result);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Send join or rejoin first' }));
        }
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) return;
      room.touch();

      switch (msg.type) {
        case 'start_game':            handleStartGame(roomCode, playerId); break;
        case 'reveal_attribute':      handleRevealAttr(roomCode, playerId, msg); break;
        case 'reveal_all':            handleRevealAll(roomCode, playerId); break;
        case 'start_voting':          handleStartVoting(roomCode, playerId); break;
        case 'cancel_voting':         handleCancelVoting(roomCode, playerId); break;
        case 'submit_vote':           handleVote(roomCode, playerId, msg); break;
        case 'end_game':              handleEndGame(roomCode, playerId); break;
        case 'kick_player':           handleKick(roomCode, playerId, msg); break;
        case 'use_profession_ability': handleUseProfessionAbility(roomCode, playerId, msg); break;
        case 'confirm_bunker_life':   handleConfirmBunkerLife(roomCode, playerId); break;
        case 'resolve_event':         handleResolveEvent(roomCode, playerId, msg); break;
      }
    });

    ws.on('close', () => {
      if (!roomCode || !playerId) return;
      wsManager.disconnect(roomCode, playerId);
      const room = rooms.get(roomCode);
      if (!room) return;

      if (wsManager.getConnected(roomCode).size === 0) {
        rooms.delete(roomCode);
        return;
      }

      wsManager.broadcast(roomCode, { type: 'player_disconnected', player_id: playerId });

      if (playerId === room.adminId) {
        const key = `${roomCode}:${playerId}`;
        const t = setTimeout(() => {
          pendingAdminTransfers.delete(key);
          transferAdmin(roomCode);
        }, 8000);
        pendingAdminTransfers.set(key, t);
      }
    });
  });
}

module.exports = setupWebSocket;
