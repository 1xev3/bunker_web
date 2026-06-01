const GameConfig = require('./gameConfig');

const DISASTER_DESCRIPTIONS = {
  'Зомби апокалипсис':
    'Неизвестный вирус превратил большую часть населения в агрессивных мертвецов. Улицы городов опустели, инфраструктура рухнула. Выжившие прячутся в изолированных убежищах.',
  'Ядерная война':
    'Ядерный конфликт между сверхдержавами уничтожил большинство крупных городов. Радиационный фон в сотни раз превышает норму, ядерная зима накрывает планету.',
  'Вирус':
    'Смертоносный вирус с летальностью свыше 90% охватил все континенты. Медицина бессильна, социальные структуры распались. Заражённые бродят повсюду.',
  'Захват пришельцами':
    'Внеземная цивилизация начала планомерное уничтожение человечества. Их технологии на столетия опережают наши. Большинство военных баз уже пали.',
  'Стихийные бедствия':
    'Серия природных катастроф обрушилась на планету одновременно: землетрясения, цунами, ураганы. Береговые линии смыты, электросети уничтожены.',
  'Экологическая катастрофа':
    'Необратимое загрязнение атмосферы сделало воздух опасным для дыхания без защиты. Вода в открытых источниках токсична, сельскохозяйственные угодья мертвы.',
  'Эпидемия':
    'Молниеносная эпидемия неизвестной болезни выкосила 80% населения за несколько недель. Правительства пали, карантинные зоны прорваны.',
  'Смертоносное оружие, созданное людьми вышло из под контроля':
    'Секретная военная разработка вырвалась из лаборатории и действует автономно. Системы уничтожения не различают своих и чужих. Армии бессильны.',
  'Животные сошли с ума':
    'Все животные планеты внезапно стали агрессивны к людям. Даже домашние питомцы атакуют. Стаи действуют скоординированно, словно под чьим-то управлением.',
  'Восстание искусственного интеллекта':
    'Глобальная сеть ИИ перехватила контроль над инфраструктурой: электросетями, транспортом и военными системами. Автономные дроны патрулируют улицы.',
  'Глобальное похолодание':
    'Резкое снижение температуры заморозило большую часть северного полушария. Урожаи уничтожены, энергосистемы рухнули. Снег не тает уже третий год.',
  'Химическая война':
    'Применение химического оружия отравило атмосферу над большинством населённых пунктов. Без защитного костюма на поверхности не выжить даже минуты.',
  'Извержение супервулкана':
    'Йеллоустоун взорвался с невероятной силой. Пепел накрыл половину континента, блокируя солнечный свет. Вулканическая зима уже началась.',
  'Падение астероида':
    'Крупный астероид ударил в океан, вызвав глобальные цунами и пылевую завесу. Небо затянуто, сейсмическая активность по всей планете зашкаливает.',
  'Биологическое оружие вышло из под контроля':
    'Генетически модифицированный патоген вырвался из тайной лаборатории. Он мутирует быстрее, чем успевают создать вакцину. Заражение стремительно расширяется.',
  'Массовые беспорядки и анархия':
    'Глобальный экономический коллапс спровоцировал повсеместные восстания. Государства пали, законы не действуют. Вооружённые банды контролируют улицы.',
  'Вторжение из параллельного измерения':
    'Разрывы в пространстве-времени открылись по всей планете, выпустив существ из другого измерения. Физические законы в зонах разрывов нестабильны.',
  'Мутация растений превратила их в хищников':
    'Стремительная мутация сделала флору агрессивной и плотоядной. Леса и поля превратились в смертельные ловушки. Растения распространяются со скоростью лесного пожара.',
  'Пробуждение древних монстров':
    'Из глубин земли и океанов поднялись существа, дремавшие миллионы лет. Их прочность делает любое оружие бесполезным. Города рушатся под их шагами.',
};

const BUNKER_DESCRIPTIONS = {
  'Маленький (50 кв.м)':
    'Тесное, но хорошо укреплённое убежище. Толстые бетонные стены надёжно защищают от внешних угроз. Каждый сантиметр пространства продуман до мелочей.',
  'Средний (80 кв.м)':
    'Комфортное убежище с разделёнными зонами для сна, работы и хранения запасов. Собственная вентиляционная система обеспечивает чистый воздух.',
  'Большой (120 кв.м)':
    'Просторный бункер с несколькими отсеками. Достаточно места, чтобы организовать полноценный быт. Система жизнеобеспечения полностью автономна.',
  'Огромный (200 кв.м)':
    'Укреплённый комплекс с множеством зон и переходов. Автономная энергосистема, воздухоочиститель и дублирующие системы безопасности обеспечивают максимальную автономность.',
};

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function generateGrid(size, itemPool) {
  const sizeIndex = GameConfig.BUNKER_SIZES.indexOf(size);
  const roomCount = sizeIndex >= 0 ? GameConfig.ROOM_COUNTS[sizeIndex] : 5;
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

  // randomly leave ~0-33% of rooms empty, minimum 1 filled room
  const emptyCount = Math.floor(Math.random() * Math.ceil(nonCenter.length / 3));
  const filledCount = Math.max(1, nonCenter.length - emptyCount);

  const base = shuffled.slice(0, filledCount);
  const extraCount = Math.min(Math.floor(Math.random() * 3), shuffled.length - filledCount);
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

class Bunker {
  constructor() {
    this.theme = '';
    this.size = '';
    this.duration = '';
    this.food = '';
    this.items = [];
    this.disaster_info = '';
    this.bunker_info = '';
    this.grid = [];
  }

  generate(theme = null) {
    this.theme = theme || GameConfig.BUNKER_THEMES[Math.floor(Math.random() * GameConfig.BUNKER_THEMES.length)];
    this.size = GameConfig.BUNKER_SIZES[Math.floor(Math.random() * GameConfig.BUNKER_SIZES.length)];
    this.duration = GameConfig.BUNKER_DURATIONS[Math.floor(Math.random() * GameConfig.BUNKER_DURATIONS.length)];
    this.food = GameConfig.FOOD_SUPPLIES[Math.floor(Math.random() * GameConfig.FOOD_SUPPLIES.length)];

    this.disaster_info = DISASTER_DESCRIPTIONS[this.theme] ?? '';
    this.bunker_info   = BUNKER_DESCRIPTIONS[this.size]   ?? '';

    this.grid = generateGrid(this.size, GameConfig.BUNKER_ITEMS);
    this.items = this.grid.flat()
      .filter(cell => cell && !cell.isEntrance)
      .flatMap(cell => cell.items);
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
