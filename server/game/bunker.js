const GameConfig = require('./gameConfig');

class Bunker {
  constructor() {
    this.theme = '';
    this.size = '';
    this.duration = '';
    this.food = '';
    this.items = [];
    this.disaster_info = '';
    this.bunker_info = '';
  }

  generate(theme = null) {
    this.theme = theme || GameConfig.BUNKER_THEMES[Math.floor(Math.random() * GameConfig.BUNKER_THEMES.length)];
    this.size = GameConfig.BUNKER_SIZES[Math.floor(Math.random() * GameConfig.BUNKER_SIZES.length)];
    this.duration = GameConfig.BUNKER_DURATIONS[Math.floor(Math.random() * GameConfig.BUNKER_DURATIONS.length)];
    this.food = GameConfig.FOOD_SUPPLIES[Math.floor(Math.random() * GameConfig.FOOD_SUPPLIES.length)];

    const count = 1 + Math.floor(Math.random() * GameConfig.BUNKER_ITEMS_COUNT_MAX);
    const pool = [...GameConfig.BUNKER_ITEMS];
    this.items = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      this.items.push(pool.splice(idx, 1)[0]);
    }

    this.disaster_info = `Тема: ${this.theme}`;
    this.bunker_info = `Бункер типа "${this.size}". Рассчитан на ${this.duration}. Имеется: ${this.items.join(', ')}.`;
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
    };
  }
}

module.exports = Bunker;
