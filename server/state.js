const SessionManager = require('./sessionManager');
const WsManager = require('./wsManager');

const rooms = new Map();
const sessions = new SessionManager();
const wsManager = new WsManager();
const pendingAdminTransfers = new Map();

module.exports = { rooms, sessions, wsManager, pendingAdminTransfers };
