const { resolveAlternatives, highlightAlt } = require('../config/yamlEvents');

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Resolves inline alternatives ("{a|b|c}") in a theme/size's label and
// description, picking one variant at random and wrapping it in highlight
// markers so the client renders it in the accent color.
function resolveThemeText(def) {
  if (!def || typeof def !== 'object') return def;
  const next = { ...def };
  if (typeof next.label === 'string') next.label = resolveAlternatives(next.label, highlightAlt);
  if (typeof next.description === 'string') next.description = resolveAlternatives(next.description, highlightAlt);
  return next;
}

function generateGrid(sizeId, itemPool, config) {
  const generationSettings = config.packSettings.bunker_generation;
  const sizeIndex = config.BUNKER_SIZES.findIndex(s => s.id === sizeId);
  const roomCount = sizeIndex >= 0 ? config.ROOM_COUNTS[sizeIndex] : 5;
  const grid = Array.from({ length: 5 }, () => Array(5).fill(null));
  const rooms = [[2, 2]];
  grid[2][2] = true;

  const frontier = [];
  const addFrontier = (r, c) => {
    DIRS.forEach(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5 && !grid[nr][nc]
          && !frontier.some(([fr, fc]) => fr === nr && fc === nc)) {
        frontier.push([nr, nc]);
      }
    });
  };

  addFrontier(2, 2);

  while (rooms.length < roomCount && frontier.length > 0) {
    const idx = Math.floor(Math.random() * frontier.length);
    const [r, c] = frontier.splice(idx, 1)[0];
    grid[r][c] = true;
    rooms.push([r, c]);
    addFrontier(r, c);
  }

  const shuffled = [...itemPool].sort(() => Math.random() - 0.5);
  const result = Array.from({ length: 5 }, () => Array(5).fill(null));

  result[2][2] = { items: [], isEntrance: true };

  const nonCenter = rooms.filter(([r, c]) => !(r === 2 && c === 2));

  const maxEmptyRooms = Math.floor(nonCenter.length * generationSettings.max_empty_fraction);
  const emptyCount = maxEmptyRooms > 0 ? randInt(0, maxEmptyRooms) : 0;
  const filledCount = Math.max(1, nonCenter.length - emptyCount);

  const base = shuffled.slice(0, filledCount);
  const extraCount = Math.min(randInt(0, generationSettings.max_extra_items), shuffled.length - filledCount);
  const extras = shuffled.slice(filledCount, filledCount + extraCount);

  const roomItems = base.map(item => [item]);
  extras.forEach(item => {
    roomItems[Math.floor(Math.random() * roomItems.length)].push(item);
  });

  // shuffle which rooms get items
  const shuffledRooms = [...nonCenter].sort(() => Math.random() - 0.5);
  shuffledRooms.forEach(([r, c], i) => {
    result[r][c] = { items: roomItems[i] ?? [] };
  });

  return result;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class Bunker {
  constructor() {
    this.theme = '';
    this.size = '';
    this.duration = '';
    this.food = null;
    this.items = [];
    this.disaster_info = '';
    this.bunker_info = '';
    this.grid = [];
  }

  generate(theme = null, config) {
    const themeDef = theme
      ? config.BUNKER_THEMES.find(t => t.id === theme || t.label === theme)
      : config.BUNKER_THEMES[Math.floor(Math.random() * config.BUNKER_THEMES.length)];
    const sizeDef = config.BUNKER_SIZES[Math.floor(Math.random() * config.BUNKER_SIZES.length)];

    const resolvedTheme = resolveThemeText(themeDef);
    const resolvedSize = resolveThemeText(sizeDef);

    this.theme = resolvedTheme;
    this.size = resolvedSize;
    this.duration = config.BUNKER_DURATIONS[Math.floor(Math.random() * config.BUNKER_DURATIONS.length)];
    this.food = config.FOOD_SUPPLIES[Math.floor(Math.random() * config.FOOD_SUPPLIES.length)];

    this.disaster_info = resolvedTheme.description ?? '';
    this.bunker_info   = resolvedSize.description  ?? '';

    this.grid = generateGrid(this.size.id, config.BUNKER_ITEMS, config);
    this.items = this.grid.flat()
      .filter(cell => cell && !cell.isEntrance)
      .flatMap(cell => cell.items);
  }

  removeRandomRoom() {
    const removable = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cell = this.grid[r][c];
        if (cell && !cell.isEntrance) removable.push([r, c]);
      }
    }
    if (removable.length === 0) return null;

    const [r, c] = removable[Math.floor(Math.random() * removable.length)];
    const removedItems = this.grid[r][c].items ?? [];
    this.grid[r][c] = null;

    for (const item of removedItems) {
      const idx = this.items.findIndex(i => i.id === item.id);
      if (idx !== -1) this.items.splice(idx, 1);
    }
    return removedItems;
  }

  // Drops an item into a random existing (non-entrance) room and the flat
  // `items` list. Returns true if placed.
  addItem(item) {
    const cells = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cell = this.grid[r][c];
        if (cell && !cell.isEntrance) cells.push(cell);
      }
    }
    if (cells.length === 0) return false;
    const cell = cells[Math.floor(Math.random() * cells.length)];
    if (!Array.isArray(cell.items)) cell.items = [];
    cell.items.push(item);
    this.items.push(item);
    return true;
  }

  // Removes one item from the bunker — a specific id, or (itemId == null) a
  // random one. Returns the removed item or null.
  removeItem(itemId = null) {
    const matches = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const cell = this.grid[r][c];
        if (!cell || !Array.isArray(cell.items)) continue;
        cell.items.forEach((item, idx) => {
          if (itemId == null || item.id === itemId) matches.push({ cell, idx, item });
        });
      }
    }
    if (matches.length === 0) return null;
    const pick = itemId == null ? matches[Math.floor(Math.random() * matches.length)] : matches[0];
    pick.cell.items.splice(pick.idx, 1);
    const gi = this.items.findIndex(i => i.id === pick.item.id);
    if (gi !== -1) this.items.splice(gi, 1);
    return pick.item;
  }

  addRoom(newItems = []) {
    const frontier = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (this.grid[r][c] !== null) continue;
        const adjacent = DIRS.some(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          return nr >= 0 && nr < 5 && nc >= 0 && nc < 5 && this.grid[nr][nc] !== null;
        });
        if (adjacent) frontier.push([r, c]);
      }
    }
    if (frontier.length === 0) return false;

    const [r, c] = frontier[Math.floor(Math.random() * frontier.length)];
    this.grid[r][c] = { items: newItems };
    for (const item of newItems) this.items.push(item);
    return true;
  }

  toDict() {
    return {
      theme: this.theme,
      size: this.size,
      duration: this.duration,
      food: this.food,
      items: this.items,
      disaster_info: this.disaster_info,
      bunker_info: this.bunker_info,
      grid: this.grid,
    };
  }
}

module.exports = Bunker;
