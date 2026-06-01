const fs = require('fs');
const path = require('path');

const PACK_FILES = ['People', 'Inventory', 'Bunker', 'Professions'];

function loadPack(packName = 'DefaultPack') {
  const dir = path.join(__dirname, 'configurations', packName);
  return PACK_FILES.reduce((cfg, file) => ({
    ...cfg,
    ...JSON.parse(fs.readFileSync(path.join(dir, `${file}.json`), 'utf8')),
  }), {});
}

function listPacks() {
  const dir = path.join(__dirname, 'configurations');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

const defaultConfig = loadPack();
defaultConfig.loadPack = loadPack;
defaultConfig.listPacks = listPacks;

module.exports = defaultConfig;
