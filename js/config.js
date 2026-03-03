// config.js — Configuration for Villa Inventory Dashboard
const CONFIG = {
  // Google Apps Script Web App URL
  // Replace after deploying Apps Script
  API_URL: window.VILLA_API_URL || 'https://script.google.com/a/*/macros/s/AKfycbxIf1cSJgj-saELzI8jklmIQGZ0FRVgfcCXTEHd8nQjhavTLMjF-knBGsJhIcI3ID2q/exec',

  // Buildings / floor tabs
  DEFAULT_BUILDING: 'mc-1f',
  BUILDINGS: {
    'mc-1f': {
      label: 'MC',
      floorPlan: 'assets/floor-plan-mc-1f.png',
      width: 2000,
      height: 1000,
      roomsFile: 'data/rooms-mc-1f.json',
      buildingId: 1
    },
    'mv-1f': {
      label: 'MV — Spa & Gym',
      floorPlan: 'assets/floor-plan-mv-1f.png',
      width: 2382,
      height: 1684,
      roomsFile: 'data/rooms-mv-1f.json',
      buildingId: 4
    },
    'mv-2f': {
      label: 'MV — Master Suite',
      floorPlan: 'assets/floor-plan-mv-2f.png',
      width: 2382,
      height: 1684,
      roomsFile: 'data/rooms-mv-2f.json',
      buildingId: 4
    },
    'sg-lower': {
      label: 'SG — Lower',
      floorPlan: 'assets/floor-plan-sg-lower.png',
      width: 1238,
      height: 1242,
      roomsFile: 'data/rooms-sg-lower.json',
      buildingId: 5
    },
    'sg-upper': {
      label: 'SG — Upper',
      floorPlan: 'assets/floor-plan-sg-upper.png',
      width: 1218,
      height: 1238,
      roomsFile: 'data/rooms-sg-upper.json',
      buildingId: 5
    },
    'ent': {
      label: 'Entertainment',
      floorPlan: 'assets/floor-plan-ent.png',
      width: 1739,
      height: 1189,
      roomsFile: 'data/rooms-ent.json',
      buildingId: 2
    }
  },

  // Floor plan (legacy — kept for backwards compat; map.js uses BUILDINGS when available)
  FLOOR_PLAN: 'assets/floor-plan-mc-1f.png',
  FLOOR_PLAN_WIDTH: 2000,
  FLOOR_PLAN_HEIGHT: 1000,

  // Pin sizes — увеличить для лучшей видимости
  PIN_SIZE: 22,        // было 20
  PIN_SIZE_HOVER: 30,  // было 28

  // Pin colors: green if room has items, gray if empty, blue when selected
  PIN_COLORS: {
    hasItems: '#4CAF50',
    empty: '#9E9E9E',
    selected: '#2196F3'
  },

  // Калибровка координат (временно, пока не пересчитаны coords в rooms.json)
  // Если пины смещены вниз — увеличить Y_OFFSET (отрицательное число сдвигает вверх)
  COORD_X_OFFSET: 0,
  COORD_Y_OFFSET: 0,  // Сдвинуть все пины вверх на 50px

  // Если нужен множитель (пропорции плана отличаются)
  COORD_X_SCALE: 1.0,
  COORD_Y_SCALE: 1.0,  // Немного сжать по Y

  // Category colors
  CATEGORY_COLORS: {
    light: '#FFD93D',
    chandelier: '#F6B93B',
    furniture: '#8B4513',
    art: '#9B59B6',
    plumbing: '#3498DB',
    carpet: '#922B21',
    curtain: '#E91E63',
    tech: '#607D8B',
    spa: '#1ABC9C',
    other: '#95A5A6',
    unknown: '#999999',
    empty: '#FFFFFF'
  },

  // Condition colors (for badges). Must match texts.CONDITIONS[key]["ru"] in bot
  // Includes legacy variants without emojis for old sheet data
  CONDITION_COLORS: {
    '✅ Отличное': '#27AE60',
    '👍 Хорошее': '#2ECC71',
    '⚠️ Удовлетворительное': '#F39C12',
    '🔧 Требует ремонта': '#E74C3C',
    '❌ Неисправно': '#95A5A6',
    // legacy (без эмодзи)
    'Отличное': '#27AE60',
    'Хорошее': '#2ECC71',
    'Удовлетворительное': '#F39C12',
    'Требует ремонта': '#E74C3C',
    'Неисправно': '#95A5A6',
    'Новое': '#27AE60',
    'Б/У': '#F39C12',
    'Повреждено': '#E74C3C'
  },

  // Filter options: all conditions (texts.CONDITIONS ru values)
  CONDITIONS: [
    { value: '', label: 'Все' },
    { value: '✅ Отличное', label: '✅ Отличное' },
    { value: '👍 Хорошее', label: '👍 Хорошее' },
    { value: '⚠️ Удовлетворительное', label: '⚠️ Удовлетворительное' },
    { value: '🔧 Требует ремонта', label: '🔧 Требует ремонта' },
    { value: '❌ Неисправно', label: '❌ Неисправно' }
  ],

  // Category icons
  CATEGORY_ICONS: {
    light: '💡',
    chandelier: '✨',
    furniture: '🪑',
    art: '🎨',
    plumbing: '🚿',
    carpet: '🧶',
    curtain: '🪟',
    tech: '📺',
    spa: '💆',
    other: '❓',
    unknown: '❓'
  }
};
