const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { normalizeConfig } = require('./structuredConfig');
const { normalizePackSettings } = require('./settings');
const { addError, validatePackContent } = require('./validator');

const PACK_FILES = ['People', 'Inventory', 'Bunker', 'Professions'];
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const CONFIGS_DIR = path.join(__dirname, '../configurations');
const lastReportedIssues = new Map();

function getPackDir(packName) {
  return path.join(CONFIGS_DIR, packName);
}

function readConfigFile(dir, baseName) {
  const yamlPath = path.join(dir, `${baseName}.yaml`);
  const jsonPath = path.join(dir, `${baseName}.json`);
  if (fs.existsSync(yamlPath)) return yaml.load(fs.readFileSync(yamlPath, 'utf8'));
  if (fs.existsSync(jsonPath)) return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return null;
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.json')) {
      files.push(full);
    }
  }
  return files;
}

function readEventsDirectory(packDir) {
  const eventsDir = path.join(packDir, 'Events');
  if (!fs.existsSync(eventsDir) || !fs.statSync(eventsDir).isDirectory()) return null;

  let eventSettings = {};
  const events = [];

  for (const filePath of walkDir(eventsDir)) {
    let content;
    try {
      content = filePath.endsWith('.json')
        ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
        : yaml.load(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      throw new Error(`Не удалось распарсить ${filePath}: ${e.message}`);
    }
    if (!content) continue;

    if (path.basename(filePath, path.extname(filePath)) === '_settings') {
      if (content.EVENT_SETTINGS) eventSettings = content.EVENT_SETTINGS;
      continue;
    }

    if (Array.isArray(content)) {
      events.push(...content);
    } else if (content && typeof content === 'object' && content.id) {
      events.push(content);
    }
  }

  return { EVENT_SETTINGS: eventSettings, EVENTS: events };
}

function readPackFiles(packName) {
  const dir = getPackDir(packName);
  const files = {};
  const errors = [];

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    addError(errors, packName, `папка не найдена: ${dir}`);
    return { valid: false, errors, files: null };
  }

  for (const file of PACK_FILES) {
    try {
      const content = readConfigFile(dir, file);
      if (content === null) {
        addError(errors, `${packName}/${file}`, 'файл отсутствует (ожидается .yaml или .json)');
        continue;
      }
      files[file] = content;
    } catch (error) {
      addError(errors, `${packName}/${file}`, `не удалось распарсить файл: ${error.message}`);
    }
  }

  // Load events: prefer Events/ directory, fall back to Event.yaml
  try {
    const eventsFromDir = readEventsDirectory(dir);
    if (eventsFromDir !== null) {
      files['Event'] = eventsFromDir;
    } else {
      const eventFile = readConfigFile(dir, 'Event');
      if (eventFile === null) {
        addError(errors, `${packName}/Event`, 'ни папка Events/ ни файл Event.yaml не найдены');
      } else {
        files['Event'] = eventFile;
      }
    }
  } catch (error) {
    addError(errors, `${packName}/Events`, `не удалось загрузить события: ${error.message}`);
  }

  try {
    const packMeta = readConfigFile(dir, 'Pack');
    if (packMeta !== null) files.Pack = packMeta;
  } catch (error) {
    addError(errors, `${packName}/Pack`, `не удалось распарсить файл: ${error.message}`);
  }

  return { valid: errors.length === 0, errors, files };
}

function validatePack(packName) {
  const parsed = readPackFiles(packName);
  if (!parsed.valid) return { packName, valid: false, errors: parsed.errors };
  return validatePackContent(packName, parsed.files);
}

function reportPackIssues(packName, errors) {
  const signature = errors.join('\n');
  if (lastReportedIssues.get(packName) === signature) return;
  lastReportedIssues.set(packName, signature);
  console.error(`[pack:${packName}] Configuration validation failed:\n- ${errors.join('\n- ')}`);
}

function formatPackError(packName, errors) {
  return `Пак "${packName}" содержит ошибки конфигурации:\n- ${errors.join('\n- ')}`;
}

function readPackMeta(packName) {
  const dir = getPackDir(packName);
  try {
    const raw = readConfigFile(dir, 'Pack');
    if (!raw) return { name: packName, author: '', color: '#f59e0b' };
    return {
      name: typeof raw.name === 'string' ? raw.name : packName,
      author: typeof raw.author === 'string' ? raw.author : '',
      color: typeof raw.color === 'string' && HEX_COLOR_RE.test(raw.color) ? raw.color : '#f59e0b',
    };
  } catch {
    return { name: packName, author: '', color: '#f59e0b' };
  }
}

function listPacks() {
  return fs.readdirSync(CONFIGS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const result = validatePack(entry.name);
      if (!result.valid) reportPackIssues(entry.name, result.errors);
      return result;
    })
    .filter((result) => result.valid)
    .map((result) => ({ id: result.packName, meta: readPackMeta(result.packName) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getDefaultPackName() {
  const packs = listPacks();
  if (packs.length === 0) throw new Error('No valid configuration packs found');
  const ids = packs.map((p) => p.id);
  return ids.includes('DefaultPack') ? 'DefaultPack' : ids[0];
}

function loadPack(packName = getDefaultPackName()) {
  const result = validatePack(packName);
  if (!result.valid) {
    reportPackIssues(packName, result.errors);
    throw new Error(formatPackError(packName, result.errors));
  }

  const dir = getPackDir(packName);
  const rawConfig = PACK_FILES.reduce((cfg, file) => ({ ...cfg, ...readConfigFile(dir, file) }), {});
  const eventData = readEventsDirectory(dir) ?? readConfigFile(dir, 'Event') ?? {};
  Object.assign(rawConfig, eventData);
  const config = normalizeConfig(rawConfig);
  config.packMeta = readPackMeta(packName);
  config.packSettings = normalizePackSettings(rawConfig);
  return config;
}

module.exports = { loadPack, listPacks, getDefaultPackName, validatePack, readPackMeta };
