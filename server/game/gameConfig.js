const { loadPack, listPacks, getDefaultPackName, validatePack, getPackStats, getPackImagePath } = require('./config/loader');

const defaultConfig = loadPack();
defaultConfig.loadPack = loadPack;
defaultConfig.listPacks = listPacks;
defaultConfig.getDefaultPackName = getDefaultPackName;
defaultConfig.validatePack = validatePack;
defaultConfig.getPackStats = getPackStats;
defaultConfig.getPackImagePath = getPackImagePath;

module.exports = defaultConfig;
