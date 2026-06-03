const { loadPack, listPacks, getDefaultPackName, validatePack, getPackStats } = require('./config/loader');

const defaultConfig = loadPack();
defaultConfig.loadPack = loadPack;
defaultConfig.listPacks = listPacks;
defaultConfig.getDefaultPackName = getDefaultPackName;
defaultConfig.validatePack = validatePack;
defaultConfig.getPackStats = getPackStats;

module.exports = defaultConfig;
