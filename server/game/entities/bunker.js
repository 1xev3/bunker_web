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

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Layout model ────────────────────────────────────────────────────────────
// A bunker is a graph of rooms placed on an integer node lattice and linked by
// corridors. The layout is generated with a randomized spanning tree so every
// room is reachable from the entrance. The client renders it as a floor plan:
//   { cols, rows, rooms: [{ id, x, y, isEntrance, items }], corridors: [{ ax, ay, bx, by }] }
// where (x, y) are 0-based node coordinates within a cols×rows lattice.

function buildLayout(roomCount) {
  // Lattice large enough to hold every room with slack, so the grown tree
  // forms an organic (non-rectangular) silhouette.
  const side = Math.max(2, Math.ceil(Math.sqrt(roomCount)) + 1);

  const occupied = new Map(); // "x,y" -> room
  const rooms = [];
  const corridors = [];
  const key = (x, y) => `${x},${y}`;

  let nextId = 0;
  const place = (x, y, isEntrance) => {
    const room = { id: isEntrance ? 'entrance' : `room_${nextId++}`, x, y, isEntrance, items: [] };
    rooms.push(room);
    occupied.set(key(x, y), room);
    return room;
  };

  const startX = Math.floor(side / 2);
  const startY = Math.floor(side / 2);
  place(startX, startY, true);

  // Frontier of edges connecting a placed node to an unplaced neighbour.
  const frontier = [];
  const addFrontier = (x, y) => {
    DIRS.forEach(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= side || ny < 0 || ny >= side) return;
      if (occupied.has(key(nx, ny))) return;
      frontier.push([x, y, nx, ny]);
    });
  };
  addFrontier(startX, startY);

  // roomCount includes the entrance.
  while (rooms.length < roomCount && frontier.length > 0) {
    const [fx, fy, tx, ty] = frontier.splice(Math.floor(Math.random() * frontier.length), 1)[0];
    if (occupied.has(key(tx, ty))) continue;
    place(tx, ty, false);
    corridors.push({ ax: fx, ay: fy, bx: tx, by: ty });
    addFrontier(tx, ty);
  }

  return normalizeLayout({ rooms, corridors });
}

// Shifts all node coordinates so the bounding box starts at (0, 0) and reports
// the lattice dimensions. Keeps the map centred/tight after add/remove.
function normalizeLayout(layout) {
  const { rooms, corridors } = layout;
  if (rooms.length === 0) return { cols: 0, rows: 0, rooms, corridors };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rooms) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x > maxX) maxX = r.x;
    if (r.y > maxY) maxY = r.y;
  }
  for (const r of rooms) { r.x -= minX; r.y -= minY; }
  for (const c of corridors) { c.ax -= minX; c.ay -= minY; c.bx -= minX; c.by -= minY; }

  return { cols: maxX - minX + 1, rows: maxY - minY + 1, rooms, corridors };
}

function distributeItems(rooms, itemPool, generationSettings) {
  const lootRooms = rooms.filter(r => !r.isEntrance);
  rooms.forEach(r => { r.items = []; });
  if (lootRooms.length === 0) return;

  const shuffled = [...itemPool].sort(() => Math.random() - 0.5);

  const maxEmpty = Math.floor(lootRooms.length * generationSettings.max_empty_fraction);
  const emptyCount = maxEmpty > 0 ? randInt(0, maxEmpty) : 0;
  const filledCount = Math.max(1, lootRooms.length - emptyCount);

  const base = shuffled.slice(0, filledCount);
  const extraCount = Math.min(randInt(0, generationSettings.max_extra_items), shuffled.length - filledCount);
  const extras = shuffled.slice(filledCount, filledCount + extraCount);

  const buckets = base.map(item => [item]);
  extras.forEach(item => { buckets[Math.floor(Math.random() * buckets.length)].push(item); });

  const shuffledRooms = [...lootRooms].sort(() => Math.random() - 0.5);
  shuffledRooms.forEach((room, i) => { room.items = buckets[i] ?? []; });
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
    this.rooms = [];
    this.corridors = [];
    this.cols = 0;
    this.rows = 0;
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

    const sizeIndex = config.BUNKER_SIZES.findIndex(s => s.id === this.size.id);
    const roomCount = sizeIndex >= 0 ? config.ROOM_COUNTS[sizeIndex] : 5;

    const layout = buildLayout(roomCount);
    distributeItems(layout.rooms, config.BUNKER_ITEMS, config.packSettings.bunker_generation);
    this.applyLayout(layout);
  }

  applyLayout(layout) {
    this.rooms = layout.rooms;
    this.corridors = layout.corridors;
    this.cols = layout.cols;
    this.rows = layout.rows;
    this.items = this.rooms.filter(r => !r.isEntrance).flatMap(r => r.items);
  }

  // Loot-bearing rooms (everything except the entrance).
  lootRooms() {
    return this.rooms.filter(r => !r.isEntrance);
  }

  removeRandomRoom() {
    const removable = this.lootRooms();
    if (removable.length === 0) return null;

    const room = removable[Math.floor(Math.random() * removable.length)];
    const removedItems = room.items ?? [];

    this.rooms = this.rooms.filter(r => r !== room);
    this.corridors = this.corridors.filter(
      c => !((c.ax === room.x && c.ay === room.y) || (c.bx === room.x && c.by === room.y))
    );
    this.applyLayout(normalizeLayout({ rooms: this.rooms, corridors: this.corridors }));
    return removedItems;
  }

  // Drops an item into a random existing room and the flat `items` list.
  addItem(item) {
    const rooms = this.lootRooms();
    if (rooms.length === 0) return false;
    const room = rooms[Math.floor(Math.random() * rooms.length)];
    if (!Array.isArray(room.items)) room.items = [];
    room.items.push(item);
    this.items.push(item);
    return true;
  }

  // Removes one item from the bunker — a specific id, or (itemId == null) a
  // random one. Returns the removed item or null.
  removeItem(itemId = null) {
    const matches = [];
    for (const room of this.lootRooms()) {
      if (!Array.isArray(room.items)) continue;
      room.items.forEach((item, idx) => {
        if (itemId == null || item.id === itemId) matches.push({ room, idx, item });
      });
    }
    if (matches.length === 0) return null;
    const pick = itemId == null ? matches[Math.floor(Math.random() * matches.length)] : matches[0];
    pick.room.items.splice(pick.idx, 1);
    const gi = this.items.findIndex(i => i.id === pick.item.id);
    if (gi !== -1) this.items.splice(gi, 1);
    return pick.item;
  }

  // Adds a new room at a free node adjacent to an existing one, linked by a
  // corridor so the layout stays connected.
  addRoom(newItems = []) {
    const occupied = new Set(this.rooms.map(r => `${r.x},${r.y}`));
    const candidates = [];
    for (const r of this.rooms) {
      for (const [dx, dy] of DIRS) {
        const nx = r.x + dx, ny = r.y + dy;
        if (!occupied.has(`${nx},${ny}`)) candidates.push({ x: nx, y: ny, from: r });
      }
    }
    if (candidates.length === 0) return false;

    const spot = candidates[Math.floor(Math.random() * candidates.length)];
    const room = { id: `room_${Date.now()}`, x: spot.x, y: spot.y, isEntrance: false, items: newItems };
    this.rooms.push(room);
    this.corridors.push({ ax: spot.from.x, ay: spot.from.y, bx: spot.x, by: spot.y });
    for (const item of newItems) this.items.push(item);
    this.applyLayout(normalizeLayout({ rooms: this.rooms, corridors: this.corridors }));
    // applyLayout recomputes items from scratch, so keep the canonical list.
    this.items = this.rooms.filter(r => !r.isEntrance).flatMap(r => r.items);
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
      layout: {
        cols: this.cols,
        rows: this.rows,
        rooms: this.rooms,
        corridors: this.corridors,
      },
    };
  }
}

module.exports = Bunker;
