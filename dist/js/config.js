// config.js — Configuration for Villa Inventory Dashboard
const CONFIG = {
  // Google Apps Script Web App URL
  // Replace after deploying Apps Script
 //
  API_URL: window.VILLA_API_URL || 'https://script.google.com/macros/s/AKfycby_rTaGMtSQps5ibqzO14kBhSItI7kEMEMhPk6CliCb9kP26aQr3VeTggzKsKZmUXI/exec',

  // Buildings / floor tabs
  DEFAULT_BUILDING: 'mc',
  BUILDINGS: {
    'mc': {
      buildingId: 1,
      label: 'MC',
      fullName: 'Главный комплекс',
      floorPlan: 'assets/floor-plan-mc-1f.png',
      hasFloorPlan: true,
      zoneFilter: null
    },
    'mv-living': {
      buildingId: 2,
      label: 'MV Жилая',
      fullName: 'Главная вилла — Жилая зона',
      floorPlan: 'assets/floor-plan-mv-1f.png',
      hasFloorPlan: true,
      zoneFilter: 201
    },
    'mv-spa': {
      buildingId: 2,
      label: 'MV Спа',
      fullName: 'Главная вилла — Спа и фитнес',
      floorPlan: 'assets/floor-plan-mv-2f.png',
      hasFloorPlan: true,
      zoneFilter: 202
    },
    'sg-lower': {
      buildingId: 3,
      label: 'SG Нижний',
      fullName: 'Гостевая вилла с видом на море — Нижний уровень',
      floorPlan: 'assets/floor-plan-sg-lower.png',
      hasFloorPlan: true,
      zoneFilter: 301
    },
    'sg-upper': {
      buildingId: 3,
      label: 'SG Верхний',
      fullName: 'Гостевая вилла с видом на море — Верхний уровень',
      floorPlan: 'assets/floor-plan-sg-upper.png',
      hasFloorPlan: true,
      zoneFilter: 302
    },
    'ga1': {
      buildingId: 4,
      label: 'GA1',
      fullName: 'Гостевая вилла 9.1',
      floorPlan: null,
      hasFloorPlan: false,
      zoneFilter: null
    },
    'ga2': {
      buildingId: 5,
      label: 'GA2',
      fullName: 'Гостевая вилла 9.2',
      floorPlan: null,
      hasFloorPlan: false,
      zoneFilter: null
    },
    'ent': {
      buildingId: 6,
      label: 'ENT',
      fullName: 'Развлекательный блок',
      floorPlan: 'assets/floor-plan-ent.png',
      hasFloorPlan: true,
      zoneFilter: null
    },
    'staff': {
      buildingId: 7,
      label: 'Staff',
      fullName: 'Корпус персонала',
      floorPlan: null,
      hasFloorPlan: false,
      zoneFilter: null
    },
    'site': {
      buildingId: 8,
      label: 'Site',
      fullName: 'Территория и инфраструктура',
      floorPlan: null,
      hasFloorPlan: false,
      zoneFilter: null
    },
    'str': {
      buildingId: 9,
      label: 'Склад',
      fullName: 'Склад расходников',
      floorPlan: null,
      hasFloorPlan: false,
      zoneFilter: null,
      listOnly: true
    }
  },

  // Building codes that are storage-type: no floor plan, always list view
  STORAGE_BUILDING_IDS: ['STR'],

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

CONFIG.BUILDING_NAMES = {};
Object.keys(CONFIG.BUILDINGS).forEach(function(key) {
  var b = CONFIG.BUILDINGS[key];
  CONFIG.BUILDING_NAMES[b.buildingId] = CONFIG.BUILDING_NAMES[b.buildingId] || b.label;
});
