const fs = require('fs');
const path = require('path');

const PACK_FILES = ['People', 'Inventory', 'Bunker', 'Professions'];
const CONFIGS_DIR = path.join(__dirname, 'configurations');

function getPackDir(packName) {
  return path.join(CONFIGS_DIR, packName);
}

function isValidPackDir(dirPath) {
  return PACK_FILES.every((file) => fs.existsSync(path.join(dirPath, `${file}.json`)));
}

function listPacks() {
  return fs.readdirSync(CONFIGS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidPackDir(getPackDir(entry.name)))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function getDefaultPackName() {
  const packs = listPacks();
  if (packs.length === 0) {
    throw new Error('No valid configuration packs found');
  }
  return packs.includes('DefaultPack') ? 'DefaultPack' : packs[0];
}

function loadPack(packName = getDefaultPackName()) {
  const dir = getPackDir(packName);
  if (!isValidPackDir(dir)) {
    throw new Error(`Pack "${packName}" not found or has invalid structure`);
  }
  return PACK_FILES.reduce((cfg, file) => ({
    ...cfg,
    ...JSON.parse(fs.readFileSync(path.join(dir, `${file}.json`), 'utf8')),
  }), {});
}

const defaultConfig = loadPack();
defaultConfig.loadPack = loadPack;
defaultConfig.listPacks = listPacks;
defaultConfig.getDefaultPackName = getDefaultPackName;

module.exports = defaultConfig;
