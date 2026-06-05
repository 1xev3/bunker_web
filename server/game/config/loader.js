const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { normalizeConfig } = require('./structuredConfig');
const { normalizePackSettings } = require('./settings');
const { addError, validatePackContent } = require('./validator');
const { readYamlEventsDirectory } = require('./yamlEvents');

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

function readEventsDirectory(packDir) {
  const eventsDir = path.join(packDir, 'Events');
  if (!fs.existsSync(eventsDir) || !fs.statSync(eventsDir).isDirectory()) return null;

  const settings = readConfigFile(eventsDir, '_settings');
  return {
    EVENT_SETTINGS: settings?.EVENT_SETTINGS ?? {},
    EVENTS: readYamlEventsDirectory(eventsDir),
  };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Optional pack feature: secret per-player role-play goals. The file is purely
// cosmetic (goals never affect game outcome), so a missing/broken file just
// yields an empty, disabled feature instead of failing pack validation.
function normalizeSecretGoals(raw) {
  if (!isPlainObject(raw)) return { count: 0, percent: null, goals: [] };
  const settings = isPlainObject(raw.SETTINGS) ? raw.SETTINGS : {};
  const goals = Array.isArray(raw.GOALS)
    ? raw.GOALS.filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim())
    : [];
  const count = Number.isFinite(settings.count) ? Math.max(0, Math.floor(settings.count)) : 0;
  const percent = Number.isFinite(settings.percent) ? Math.min(1, Math.max(0, settings.percent)) : null;
  return { count, percent, goals };
}

function countSectionEntries(value) {
  if (Array.isArray(value)) return value.length;
  if (isPlainObject(value)) return Object.keys(value).length;
  if (value === undefined || value === null) return 0;
  return 1;
}

function buildPackSections(files) {
  return Object.entries(files)
    .filter(([fileName, content]) => fileName !== 'Pack' && isPlainObject(content))
    .flatMap(([fileName, content]) => Object.entries(content)
      .map(([key, value]) => ({
        id: `${fileName}.${key}`,
        label: key,
        count: countSectionEntries(value),
        group: fileName,
      }))
      .filter((section) => section.count > 0));
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

  try {
    const eventsFromDir = readEventsDirectory(dir);
    if (eventsFromDir === null) {
      addError(errors, `${packName}/Events`, 'папка Events/ не найдена');
    } else {
      files['Event'] = eventsFromDir;
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
  Object.assign(rawConfig, readEventsDirectory(dir) ?? {});
  const config = normalizeConfig(rawConfig);
  config.packId = packName;
  config.packMeta = readPackMeta(packName);
  config.packSettings = normalizePackSettings(rawConfig);
  try {
    config.secretGoals = normalizeSecretGoals(readConfigFile(dir, 'SecretGoals'));
  } catch {
    config.secretGoals = { count: 0, percent: null, goals: [] };
  }
  return config;
}

// Allowed image extensions and the maximum file size we will serve. Anything
// else in the Images/ directory is ignored so a pack can never have us hand out
// an oversized or non-image file.
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

// Resolves a theme/size image filename to an absolute path on disk, or null if
// it does not exist, has a disallowed extension, or exceeds the size limit.
// `path.basename` strips any directory components from both the pack name and
// the file name, so a crafted value can never escape the pack's Images/
// directory (path traversal guard).
function getPackImagePath(packName, fileName) {
  if (typeof packName !== 'string' || typeof fileName !== 'string') return null;
  const safePack = path.basename(packName);
  const safeFile = path.basename(fileName);
  if (!safePack || !safeFile) return null;
  if (!ALLOWED_IMAGE_EXTENSIONS.has(path.extname(safeFile).toLowerCase())) return null;
  const resolved = path.join(CONFIGS_DIR, safePack, 'Images', safeFile);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) return null;
  return resolved;
}

function getPackStats(packName) {
  const parsed = readPackFiles(packName);
  if (!parsed.valid) {
    reportPackIssues(packName, parsed.errors);
    throw new Error(formatPackError(packName, parsed.errors));
  }

  const validation = validatePackContent(packName, parsed.files);
  if (!validation.valid) {
    reportPackIssues(packName, validation.errors);
    throw new Error(formatPackError(packName, validation.errors));
  }

  const files = parsed.files;
  const sections = buildPackSections(files);
  const sectionGroups = new Set(sections.map((section) => section.group));

  return {
    id: packName,
    meta: readPackMeta(packName),
    summary: {
      total_entries: sections.reduce((sum, section) => sum + section.count, 0),
      config_files: Object.keys(files).length,
      section_groups: sectionGroups.size,
    },
    sections,
  };
}

module.exports = { loadPack, listPacks, getDefaultPackName, validatePack, readPackMeta, getPackStats, getPackImagePath };
