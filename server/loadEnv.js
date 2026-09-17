const fs = require('fs');
const path = require('path');

function loadRootEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return false;
  if (typeof process.loadEnvFile !== 'function') {
    throw new Error('Загрузка .env требует Node.js 20.12 или новее');
  }
  process.loadEnvFile(envPath);
  return true;
}

module.exports = { loadRootEnv };
