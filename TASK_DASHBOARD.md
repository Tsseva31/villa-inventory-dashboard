## Phase 2: Villa Dashboard — Revised Implementation Plan

### Initial Data

- Specification: TASK_DASHBOARD.md
- Stack: Vanilla HTML, CSS, JavaScript (no backend)
- Data source: Google Sheets via Apps Script Web App
- Resources:
  - Floor plan: assets/floor-plan-mc.png (1545×763px)
  - Coordinates: data/rooms.json (24 rooms, key = room code MC1XX)

⚠️ IMPORTANT: Google Sheets Structure

**Sheet "Комнаты" (Rooms) – real structure**
| Column Index | Description |
|--------------|-------------|
| 0 | ID – unique room ID (1, 2, 3...) |
| 1 | Zone_ID (used in bot, not needed in dashboard) |
| 2 | Название – room name ("Bar", "Grand Dining") |
| 3 | Номер – room code (MC131, MC132...) – **this is the key** for linking with rooms.json |
| 4 | Этаж – floor |
| 5 | Тип – room type |
| 6 | Активно – TRUE/FALSE |
| 7 | Площадь_м² – area |

**Key point**: Column "Номер" contains the room code (MC131, MC132...), which matches the keys in rooms.json.

**Sheet "Предметы" (Items) – structure from the bot**
| Column Index | Description |
|--------------|-------------|
| 0 | ID – INV-YYYYMMDD-HHMMSS |
| 1 | Дата_создания – creation date |
| 2 | Telegram_ID |
| 3 | Building_ID |
| 4 | Zone_ID |
| 5 | Room_ID – link to ID from "Комнаты" sheet |
| 6 | Категория – category (light, furniture, art...) |
| 7 | Подкатегория – (empty in MVP) |
| 8 | Название – (empty in MVP) |
| 9 | Описание – description |
| 10 | Состояние – condition |
| 11 | Количество – quantity |
| 12 | Фото_кол-во – photo count |
| 13 | Фото_1 – URL |
| 14 | Фото_2 – URL |
| 15 | Фото_3 – URL |
| 16 | Фото_4 – URL |
| 17 | Фото_5 – URL |
| 18 | Последнее_обновление – last updated |
| 19 | Статус – status |

### Project Structure
villa-dashboard/
├── index.html              # Main HTML file
├── css/
│   └── styles.css          # Styles
├── js/
│   ├── config.js           # Configuration (API_URL, colors, sizes)
│   ├── api.js              # Requests to Apps Script + mock data
│   ├── map.js              # Floor plan rendering and pins (SVG overlay)
│   └── app.js              # Initialization, state, UI logic
├── data/
│   └── rooms.json          # Room coordinates (24 rooms)
├── assets/
│   └── floor-plan-mc.png   # Floor plan image
├── package.json            # For Railway deployment
├── server.js               # Simple Express server
└── README.md               # Documentation
text### Step 0: Base Structure

**config.js**
```javascript
const CONFIG = {
  // Google Apps Script Web App URL
  // Replace after deploying Apps Script
  API_URL: window.VILLA_API_URL || '',
  
  // Floor plan
  FLOOR_PLAN: 'assets/floor-plan-mc.png',
  FLOOR_PLAN_WIDTH: 1545,
  FLOOR_PLAN_HEIGHT: 763,
  
  // Pin sizes
  PIN_SIZE: 20,
  PIN_SIZE_HOVER: 28,
  
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
    empty: '#FFFFFF'
  },
  
  // Condition colors (for badges)
  CONDITION_COLORS: {
    'Отличное': '#27AE60',
    'Удовлетворительное': '#F39C12',
    'Требует ремонта': '#E74C3C'
  },
  
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
    other: '❓'
  }
};
index.html (markup)
HTML<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Villa Inventory Dashboard</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <!-- Header with filters -->
  <header class="header">
    <h1>🏠 Villa Inventory Dashboard</h1>
    <div class="filters">
      <select id="filter-category">
        <option value="">All categories</option>
        <!-- Populated from JS -->
      </select>
      <select id="filter-condition">
        <option value="">All conditions</option>
        <option value="Отличное">Excellent</option>
        <option value="Удовлетворительное">Satisfactory</option>
        <option value="Требует ремонта">Needs repair</option>
      </select>
      <input type="text" id="filter-search" placeholder="🔍 Search...">
    </div>
  </header>

  <!-- Main content -->
  <main class="main">
    <!-- Map -->
    <div class="map-container" id="map-container">
      <img src="assets/floor-plan-mc.png" alt="Floor Plan" id="floor-plan">
      <svg id="pins-layer" class="pins-layer"></svg>
      <div id="tooltip" class="tooltip hidden"></div>
    </div>
    
    <!-- Sidebar with room details -->
    <aside class="sidebar hidden" id="sidebar">
      <button class="sidebar-close" id="sidebar-close">×</button>
      <div class="sidebar-header">
        <h2 id="room-title">MC132 — GRAND DINING</h2>
        <span class="items-count" id="items-count">0 items</span>
      </div>
      <div class="items-list" id="items-list">
        <!-- Populated from JS -->
      </div>
    </aside>
  </main>

  <!-- Footer with legend and stats -->
  <footer class="footer">
    <div class="legend" id="legend">
      <!-- Populated from JS -->
    </div>
    <div class="stats" id="stats">
      Loading...
    </div>
  </footer>

  <!-- Photo modal -->
  <div class="modal hidden" id="photo-modal">
    <div class="modal-content">
      <button class="modal-close" id="modal-close">×</button>
      <img id="modal-photo" src="" alt="Photo">
    </div>
  </div>

  <!-- Scripts -->
  <script src="js/config.js"></script>
  <script src="js/api.js"></script>
  <script src="js/map.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
Step W1–W2: Floor Plan & Coordinates
Already prepared:

assets/floor-plan-mc.png – floor plan (1545×763px)
data/rooms.json – 24 rooms with coordinates

map.js – implement pin rendering
JavaScript// map.js

class FloorMap {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.pinsLayer = document.getElementById('pins-layer');
    this.floorPlan = document.getElementById('floor-plan');
    this.tooltip = document.getElementById('tooltip');
    
    this.rooms = {};      // Coordinates from rooms.json
    this.roomsData = {};  // Data from API (items per room)
    this.scale = 1;
    
    this.init();
  }
  
  async init() {
    // Load coordinates
    const res = await fetch('data/rooms.json');
    this.rooms = await res.json();
    
    // Handle resize
    window.addEventListener('resize', () => this.updateScale());
    this.floorPlan.addEventListener('load', () => this.updateScale());
  }
  
  updateScale() {
    const rect = this.floorPlan.getBoundingClientRect();
    this.scale = rect.width / CONFIG.FLOOR_PLAN_WIDTH;
    
    // Update SVG layer size
    this.pinsLayer.setAttribute('width', rect.width);
    this.pinsLayer.setAttribute('height', rect.height);
    this.pinsLayer.style.width = rect.width + 'px';
    this.pinsLayer.style.height = rect.height + 'px';
    
    this.renderPins();
  }
  
  setData(roomsData) {
    // roomsData = { "MC132": { items: [...], dominantCategory: "furniture" }, ... }
    this.roomsData = roomsData;
    this.renderPins();
  }
  
  renderPins() {
    this.pinsLayer.innerHTML = '';
    
    Object.entries(this.rooms).forEach(([code, coords]) => {
      const data = this.roomsData[code] || { items: [], dominantCategory: 'empty' };
      const color = CONFIG.CATEGORY_COLORS[data.dominantCategory] || CONFIG.CATEGORY_COLORS.empty;
      
      const x = coords.x * this.scale;
      const y = coords.y * this.scale;
      const r = CONFIG.PIN_SIZE / 2;
      
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', color);
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '2');
      circle.setAttribute('data-code', code);
      circle.classList.add('pin');
      
      if (data.dominantCategory === 'empty') {
        circle.setAttribute('fill', 'transparent');
        circle.setAttribute('stroke', '#888');
      }
      
      circle.addEventListener('mouseenter', (e) => this.showTooltip(e, code, coords.name));
      circle.addEventListener('mouseleave', () => this.hideTooltip());
      circle.addEventListener('click', () => this.onPinClick(code));
      
      this.pinsLayer.appendChild(circle);
    });
  }
  
  showTooltip(e, code, name) {
    this.tooltip.textContent = `${code} — ${name}`;
    this.tooltip.style.left = e.clientX + 10 + 'px';
    this.tooltip.style.top = e.clientY - 30 + 'px';
    this.tooltip.classList.remove('hidden');
  }
  
  hideTooltip() {
    this.tooltip.classList.add('hidden');
  }
  
  onPinClick(code) {
    if (this.onRoomSelect) {
      this.onRoomSelect(code);
    }
  }
  
  highlightRooms(visibleCodes) {
    const pins = this.pinsLayer.querySelectorAll('.pin');
    pins.forEach(pin => {
      const code = pin.getAttribute('data-code');
      if (visibleCodes.includes(code)) {
        pin.classList.remove('dimmed');
      } else {
        pin.classList.add('dimmed');
      }
    });
  }
}
Step W3: API & Data
api.js
JavaScript// api.js

// Mock data for development without real API
const MOCK_DATA = {
  rooms: [
    { id: 1, zone_id: 1, name: 'Bar', code: 'MC131' },
    { id: 2, zone_id: 1, name: 'Grand Dining', code: 'MC132' },
    { id: 3, zone_id: 1, name: 'Grand Living', code: 'MC133' },
    { id: 17, zone_id: 1, name: 'Library', code: 'MC137' },
    { id: 21, zone_id: 1, name: 'Hollywood Movie Theatre', code: 'MC113' },
  ],
  items: [
    { id: 'INV-TEST-001', room_id: 2, category: 'furniture', description: 'Dining table for 20 people', condition: 'Отличное', quantity: 1, photos: [] },
    { id: 'INV-TEST-002', room_id: 2, category: 'light', description: 'Crystal chandelier', condition: 'Отличное', quantity: 1, photos: [] },
    { id: 'INV-TEST-003', room_id: 17, category: 'furniture', description: 'Antique bookshelf', condition: 'Удовлетворительное', quantity: 1, photos: [] },
    { id: 'INV-TEST-004', room_id: 21, category: 'tech', description: 'Sony 4K projector', condition: 'Отличное', quantity: 1, photos: [] },
  ]
};

class API {
  constructor() {
    this.baseUrl = CONFIG.API_URL;
    this.useCache = false;
  }
  
  async request(action) {
    const url = this.baseUrl 
      ? `${this.baseUrl}?action=${action}&nocache=${Date.now()}`
      : null;
    
    if (!url) {
      console.warn('API_URL not set, using mock data');
      return this.getMockData(action);
    }
    
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.error('API error:', e);
      console.warn('Falling back to mock data');
      return this.getMockData(action);
    }
  }
  
  getMockData(action) {
    if (action === 'getRooms') return { success: true, rooms: MOCK_DATA.rooms };
    if (action === 'getItems') return { success: true, items: MOCK_DATA.items };
    return { error: 'Unknown action' };
  }
  
  async getRooms() {
    const data = await this.request('getRooms');
    return data.rooms || [];
  }
  
  async getItems() {
    const data = await this.request('getItems');
    return data.items || [];
  }
}

const api = new API();
Google Apps Script (adjusted to real sheet structure)
JavaScript// Paste this into Extensions → Apps Script

function doGet(e) {
  const action = e.parameter.action || 'getItems';
  
  let result;
  switch(action) {
    case 'getItems':
      result = getItems();
      break;
    case 'getRooms':
      result = getRooms();
      break;
    case 'getAll':
      result = {
        success: true,
        rooms: getRooms().rooms,
        items: getItems().items
      };
      break;
    default:
      result = { error: 'Unknown action' };
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getItems() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Предметы');
  
  if (!sheet) return { success: false, error: 'Sheet "Предметы" not found', items: [] };
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, items: [] };
  
  const items = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    
    const photos = [];
    for (let j = 13; j <= 17; j++) {
      if (row[j]) photos.push(row[j]);
    }
    
    items.push({
      id: row[0],
      date: row[1],
      telegram_id: row[2],
      building_id: row[3],
      zone_id: row[4],
      room_id: row[5],
      category: row[6],
      description: row[9],
      condition: row[10],
      quantity: row[11] || 1,
      photo_count: row[12],
      photos: photos,
      status: row[19]
    });
  }
  
  return { success: true, count: items.length, items: items };
}

function getRooms() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Комнаты');
  
  if (!sheet) return { success: false, error: 'Sheet "Комнаты" not found', rooms: [] };
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, rooms: [] };
  
  const rooms = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    
    const active = String(row[6]).toUpperCase();
    if (active !== 'TRUE' && active !== '1') continue;
    
    rooms.push({
      id: row[0],
      zone_id: row[1],
      name: row[2],
      code: row[3],           // This is the key: MC131, MC132...
      floor: row[4],
      type: row[5],
      area: row[7]
    });
  }
  
  return { success: true, count: rooms.length, rooms: rooms };
}
Step W4: Interactivity
app.js
JavaScript// app.js

class App {
  constructor() {
    this.map = null;
    this.rooms = [];
    this.items = [];
    this.roomsCoords = {};
    this.roomIdToCode = {};
    
    this.filters = {
      category: '',
      condition: '',
      search: ''
    };
    
    this.init();
  }
  
  async init() {
    this.map = new FloorMap('map-container');
    this.map.onRoomSelect = (code) => this.showRoomDetails(code);
    
    const coordsRes = await fetch('data/rooms.json');
    this.roomsCoords = await coordsRes.json();
    
    await this.loadData();
    
    this.setupFilters();
    this.setupSidebar();
    this.setupModal();
    this.renderLegend();
    
    this.applyFilters();
  }
  
  async loadData() {
    this.showLoading();
    
    try {
      this.rooms = await api.getRooms();
      this.items = await api.getItems();
      
      this.rooms.forEach(room => {
        this.roomIdToCode[room.id] = room.code;
      });
      
      console.log(`Loaded: ${this.rooms.length} rooms, ${this.items.length} items`);
    } catch (e) {
      console.error('Data loading error:', e);
      this.showError('Failed to load data. Check API settings.');
    }
    
    this.hideLoading();
  }
  
  getItemsByRoom() {
    const byRoom = {};
    
    this.items.forEach(item => {
      const code = this.roomIdToCode[item.room_id];
      if (!code) return;
      
      if (!byRoom[code]) byRoom[code] = [];
      byRoom[code].push(item);
    });
    
    return byRoom;
  }
  
  getDominantCategory(items) {
    if (!items || items.length === 0) return 'empty';
    
    const counts = {};
    items.forEach(item => {
      const cat = item.category || 'other';
      counts[cat] = (counts[cat] || 0) + (item.quantity || 1);
    });
    
    let maxCount = 0;
    let dominant = 'other';
    
    Object.entries(counts).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominant = cat;
      }
    });
    
    return dominant;
  }
  
  applyFilters() {
    const itemsByRoom = this.getItemsByRoom();
    const roomsData = {};
    let totalItems = 0;
    let visibleRooms = 0;
    
    Object.keys(this.roomsCoords).forEach(code => {
      let items = itemsByRoom[code] || [];
      
      items = items.filter(item => {
        if (this.filters.category && item.category !== this.filters.category) return false;
        if (this.filters.condition && item.condition !== this.filters.condition) return false;
        if (this.filters.search) {
          const search = this.filters.search.toLowerCase();
          const desc = (item.description || '').toLowerCase();
          const roomName = (this.roomsCoords[code]?.name || '').toLowerCase();
          if (!desc.includes(search) && !roomName.includes(search) && !code.toLowerCase().includes(search)) {
            return false;
          }
        }
        return true;
      });
      
      roomsData[code] = {
        items: items,
        dominantCategory: this.getDominantCategory(items)
      };
      
      totalItems += items.length;
      if (items.length > 0) visibleRooms++;
    });
    
    this.map.setData(roomsData);
    
    const visibleCodes = Object.keys(roomsData).filter(code => roomsData[code].items.length > 0);
    this.map.highlightRooms(this.filters.category || this.filters.condition || this.filters.search ? visibleCodes : Object.keys(this.roomsCoords));
    
    this.updateStats(totalItems, visibleRooms);
    
    this.currentRoomsData = roomsData;
  }
  
  setupFilters() {
    const categorySelect = document.getElementById('filter-category');
    Object.entries(CONFIG.CATEGORY_ICONS).forEach(([key, icon]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = `${icon} ${key}`;
      categorySelect.appendChild(option);
    });
    
    document.getElementById('filter-category').addEventListener('change', (e) => {
      this.filters.category = e.target.value;
      this.applyFilters();
    });
    
    document.getElementById('filter-condition').addEventListener('change', (e) => {
      this.filters.condition = e.target.value;
      this.applyFilters();
    });
    
    document.getElementById('filter-search').addEventListener('input', (e) => {
      this.filters.search = e.target.value;
      this.applyFilters();
    });
  }
  
  setupSidebar() {
    document.getElementById('sidebar-close').addEventListener('click', () => {
      document.getElementById('sidebar').classList.add('hidden');
    });
  }
  
  setupModal() {
    document.getElementById('modal-close').addEventListener('click', () => {
      document.getElementById('photo-modal').classList.add('hidden');
    });
    
    document.getElementById('photo-modal').addEventListener('click', (e) => {
      if (e.target.id === 'photo-modal') {
        document.getElementById('photo-modal').classList.add('hidden');
      }
    });
  }
  
  showRoomDetails(code) {
    const sidebar = document.getElementById('sidebar');
    const roomData = this.currentRoomsData[code] || { items: [] };
    const roomCoords = this.roomsCoords[code] || { name: code };
    
    document.getElementById('room-title').textContent = `${code} — ${roomCoords.name}`;
    document.getElementById('items-count').textContent = `${roomData.items.length} items`;
    
    const list = document.getElementById('items-list');
    list.innerHTML = '';
    
    if (roomData.items.length === 0) {
      list.innerHTML = '<div class="no-items">No items</div>';
    } else {
      roomData.items.forEach(item => {
        const itemEl = this.createItemElement(item);
        list.appendChild(itemEl);
      });
    }
    
    sidebar.classList.remove('hidden');
  }
  
  createItemElement(item) {
    const div = document.createElement('div');
    div.className = 'item-card';
    
    const icon = CONFIG.CATEGORY_ICONS[item.category] || '❓';
    const conditionColor = CONFIG.CONDITION_COLORS[item.condition] || '#888';
    
    let photoHtml = '';
    if (item.photos && item.photos.length > 0) {
      const thumbUrl = this.getDriveThumbnail(item.photos[0]);
      photoHtml = `<img src="${thumbUrl}" class="item-thumb" onclick="app.showPhoto('${item.photos[0]}')" alt="Photo">`;
    }
    
    div.innerHTML = `
      <div class="item-header">
        <span class="item-icon">${icon}</span>
        <span class="item-category">${item.category}</span>
        <span class="item-condition" style="background: $$   {conditionColor}">   $${item.condition}</span>
      </div>
      <div class="item-body">
        <div class="item-description">${item.description || '—'}</div>
        <div class="item-quantity">Qty: ${item.quantity || 1}</div>
        ${photoHtml}
      </div>
    `;
    
    return div;
  }
  
  getDriveThumbnail(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`;
    }
    return url;
  }
  
  showPhoto(url) {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fullUrl = match 
      ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`
      : url;
    
    document.getElementById('modal-photo').src = fullUrl;
    document.getElementById('photo-modal').classList.remove('hidden');
  }
  
  renderLegend() {
    const legend = document.getElementById('legend');
    legend.innerHTML = Object.entries(CONFIG.CATEGORY_COLORS)
      .filter(([key]) => key !== 'empty')
      .map(([key, color]) => {
        const icon = CONFIG.CATEGORY_ICONS[key] || '';
        return `<span class="legend-item">
          <span class="legend-color" style="background: ${color}"></span>
          ${icon} ${key}
        </span>`;
      })
      .join('');
  }
  
  updateStats(items, rooms) {
    document.getElementById('stats').textContent = 
      `Showing: ${items} items in ${rooms} rooms`;
  }
  
  showLoading() {
    document.getElementById('map-container').classList.add('loading');
  }
  
  hideLoading() {
    document.getElementById('map-container').classList.remove('loading');
  }
  
  showError(msg) {
    document.getElementById('stats').textContent = `⚠️ ${msg}`;
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new App();
});
Step W5: Deployment
package.json
JSON{
  "name": "villa-inventory-dashboard",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
server.js
JavaScriptconst express = require('express');
const path = require('path');
const app = express();

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Villa Dashboard running on port ${PORT}`);
});
README.md
Markdown# Villa Inventory Dashboard

Interactive floor plan visualization of villa inventory.

## Quick Start

1. Open `index.html` in browser
2. Works with mock data without API setup

## Google Apps Script Setup

1. Open your Google Sheet
2. Extensions → Apps Script
3. Paste code from `apps-script.js`
4. Deploy → New deployment → Web app
5. Execute as: Me, Who has access: Anyone
6. Copy the Web app URL and paste into `js/config.js` → `API_URL`

## Deploy to Railway

1. Push to GitHub
2. Railway → New Project → Deploy from GitHub
3. It will auto-detect Node.js
4. Done!

## Data Structure Notes

- **"Комнаты" sheet**: column "Номер" contains room code (MC131, MC132...)
- **"Предметы" sheet**: column "Room_ID" links to ID from "Комнаты"
- **rooms.json**: room coordinates, key = room code (MC131, MC132...)
## Bug Fixes (2025-02-03)
- [x] Fixed: empty pins invisible on white background
- [x] Fixed: pins jumping on hover (removed CSS transform)
- [x] Fixed: click not working (added stopPropagation)
- [ ] TODO: verify pin coordinates alignment

---

Acceptance Criteria

Floor plan is displayed
24 pins placed correctly (from rooms.json)
Pin color = dominant category
Hover on pin shows tooltip with room name
Click on pin opens sidebar with items
Category filter works
Condition filter works
Search by description / room name works
Item / room counter updates
Photos open in modal
Color legend displayed
Responsive on mobile
Mock data fallback when API not available
Deployed to Railway

⚠️ Critical Mapping Logic

"Предметы".Room_ID → "Комнаты".ID → "Комнаты".Номер (code) → rooms.json key
Column "Номер" in "Комнаты" = room code (MC131, MC132...)
Dashboard must work offline with mock data
Google Drive URLs converted to thumbnails for preview

## Current Issues (2025-02-03)

### Issue 1: Pin coordinates offset
- **Symptom:** Pins appear below/left of actual room positions
- **Debug data:** Scale 1.277, Image 1973×986 (original 1545×763)
- **Root cause:** rooms.json coordinates may need recalibration
- **Solution:** Add COORD_Y_OFFSET in config.js OR recalculate rooms.json

### Issue 2: Photos not loading in modal
- **Symptom:** Empty screen with close button
- **Root cause:** Google Drive URL parsing or thumbnail API issue
- **Solution:** Fix getDriveThumbnail() and showPhoto() methods

### Calibration values to try:
```javascript
COORD_X_OFFSET: 0,
COORD_Y_OFFSET: -50,  // Adjust based on testing
COORD_X_SCALE: 1.0,
COORD_Y_SCALE: 0.95,
## Bug Fixes (2025-02-03)
- [x] Fixed: empty pins invisible on white background
- [x] Fixed: pins jumping on hover (removed CSS transform)
- [x] Fixed: click not working (added stopPropagation)
- [ ] TODO: verify pin coordinates alignment