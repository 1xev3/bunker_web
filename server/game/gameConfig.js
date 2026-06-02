const { loadPack, listPacks, getDefaultPackName, validatePack } = require('./config/loader');

const defaultConfig = loadPack();
defaultConfig.loadPack = loadPack;
defaultConfig.listPacks = listPacks;
defaultConfig.getDefaultPackName = getDefaultPackName;
defaultConfig.validatePack = validatePack;

module.exports = defaultConfig;
