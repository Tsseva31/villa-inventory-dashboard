// app.js — Initialization, state, UI logic

/** Convert Google Drive view/share URL to direct uc?id= form for reliable embedding. */
function convertDriveUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return 'https://drive.google.com/uc?id=' + match[1];
  const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId) return 'https://drive.google.com/uc?id=' + matchId[1];
  return url;
}

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
    const roomsJsonKeys = Object.keys(this.roomsCoords);
    console.log('[PIN] 1. rooms.json: rooms count =', roomsJsonKeys.length);
    console.log('[PIN] rooms.json first 3 keys:', roomsJsonKeys.slice(0, 3));
    await this.loadData();
    await this.waitForFloorPlanImage();

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

      console.log('[PIN] 2. API: items count =', this.items.length);
      if (this.items.length > 0) {
        console.log('[PIN] First item from API (structure):', JSON.stringify(this.items[0], null, 2));
      }
      console.log('[PIN] roomIdToCode (ID → code):', this.roomIdToCode);

      this.logPinDiagnostics();
    } catch (e) {
      console.error('Data loading error:', e);
      this.showError('Failed to load data. Check API settings.');
    }

    this.hideLoading();
  }

  waitForFloorPlanImage() {
    const img = document.querySelector('#floor-plan');
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }

  /** Диагностика: для каждого item — связь с комнатой и координаты из rooms.json. Uses same logic as getItemsByRoom(). */
  logPinDiagnostics() {
    console.log('[PIN] 3. Item → room → coords:');
    this.items.forEach((item) => {
      const code = (item.room_code && this.roomsCoords[item.room_code])
        ? item.room_code
        : this.roomIdToCode[item.room_id];
      const roomLabel = code != null ? ('"' + code + '"') : ('room_id=' + item.room_id);
      const coords = code ? this.roomsCoords[code] : null;
      const found = !!coords;
      if (found) {
        console.log('[PIN] Item "' + (item.id || item.description) + '" → room ' + roomLabel + ' → found: true → x:' + coords.x + ', y:' + coords.y);
      } else {
        const reason = !code ? 'no room_code on map and room_id not in roomIdToCode' : 'code not in rooms.json';
        console.log('[PIN] Item "' + (item.id || item.description) + '" → room ' + roomLabel + ' → found: false → SKIP (' + reason + ')');
      }
    });
  }

  /** Нормализация полей: исправляет перепутанные quantity/condition из API */
  normalizeItemFields(item) {
    const CONDITION_VALUES = ['Отличное', 'Хорошее', 'Удовлетворительное', 'Требует ремонта', 'Неисправно'];
    let condition = item.condition;
    let quantity = item.quantity;
    if (typeof item.quantity === 'string' && CONDITION_VALUES.includes(item.quantity)) {
      condition = item.quantity;
      quantity = item.condition;
    }
    quantity = parseInt(quantity, 10) || 1;
    let category = (item.category && String(item.category).trim()) || 'unknown';
    if (category === item.room_code || !category) category = 'unknown';
    return { condition, quantity, category };
  }

  getItemsByRoom() {
    const byRoom = {};

    this.items.forEach(item => {
      // Prefer room_code from API (column G) when it exists on map; fallback to room_id → code
      const code = (item.room_code && this.roomsCoords[item.room_code])
        ? item.room_code
        : this.roomIdToCode[item.room_id];
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
      const norm = this.normalizeItemFields(item);
      const cat = norm.category === 'unknown' ? 'other' : norm.category;
      counts[cat] = (counts[cat] || 0) + norm.quantity;
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
        const norm = this.normalizeItemFields(item);
        const filterCat = (this.filters.category && String(this.filters.category).trim()) || '';
        if (filterCat && norm.category !== filterCat) return false;
        if (this.filters.condition && (norm.condition || '') !== this.filters.condition) return false;
        if (this.filters.search) {
          const search = this.filters.search.toLowerCase();
          const desc = (item.description || '').toLowerCase();
          const roomName = (this.roomsCoords[code] && this.roomsCoords[code].name ? this.roomsCoords[code].name : '').toLowerCase();
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

    const visibleCodes = Object.keys(this.roomsCoords).filter(code => {
      if (this.filters.category || this.filters.condition || this.filters.search) {
        return roomsData[code] && roomsData[code].items.length > 0;
      }
      return true;
    });
    this.map.highlightRooms(visibleCodes);

    this.updateStats(totalItems, visibleRooms);

    this.currentRoomsData = roomsData;
  }

  filterItems() {
    const categorySelect = document.getElementById('filter-category');
    const conditionSelect = document.getElementById('filter-condition');
    if (!categorySelect || !conditionSelect) return;

    const selectedCategory = categorySelect.value;
    const selectedCondition = conditionSelect.value;

    const items = document.querySelectorAll('.items-list .item-card, .items-list .item');
    let visibleCount = 0;

    items.forEach(card => {
      const itemCategory = card.dataset.category || '';
      const itemCondition = card.dataset.condition || '';

      const categoryMatch = !selectedCategory || selectedCategory === '' || itemCategory === selectedCategory;
      const conditionMatch = !selectedCondition || selectedCondition === '' || itemCondition === selectedCondition;

      if (categoryMatch && conditionMatch) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    const countEl = document.getElementById('items-count');
    if (countEl) countEl.textContent = visibleCount + ' items';
  }

  setupFilters() {
    const categorySelect = document.getElementById('filter-category');
    categorySelect.innerHTML = '';
    const allCatOption = document.createElement('option');
    allCatOption.value = '';
    allCatOption.textContent = 'All categories';
    categorySelect.appendChild(allCatOption);
    Object.entries(CONFIG.CATEGORY_ICONS || {}).forEach(([key, icon]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = icon + ' ' + key;
      categorySelect.appendChild(option);
    });

    const conditionSelect = document.getElementById('filter-condition');
    conditionSelect.innerHTML = '';
    (CONFIG.CONDITIONS || Object.keys(CONFIG.CONDITION_COLORS || {}).map(v => ({ value: v, label: v }))).forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      conditionSelect.appendChild(option);
    });

    document.getElementById('filter-category').addEventListener('change', (e) => {
      this.filters.category = e.target.value;
      this.applyFilters();
      if (this.sidebar && !this.sidebar.classList.contains('hidden')) this.filterItems();
    });

    document.getElementById('filter-condition').addEventListener('change', (e) => {
      this.filters.condition = e.target.value;
      this.applyFilters();
      if (this.sidebar && !this.sidebar.classList.contains('hidden')) this.filterItems();
    });

    document.getElementById('filter-search').addEventListener('input', (e) => {
      this.filters.search = e.target.value.trim();
      this.applyFilters();
      if (this.sidebar && !this.sidebar.classList.contains('hidden')) this.filterItems();
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

    document.getElementById('items-list').addEventListener('click', (e) => {
      const thumb = e.target.closest('.item-thumb') || e.target.closest('.item-photo');
      if (thumb && thumb.dataset.photoUrl) {
        this.showPhoto(thumb.dataset.photoUrl);
      }
    });
  }

  showRoomDetails(code) {
    console.log('[App] showRoomDetails called with:', code);
    const sidebar = document.getElementById('sidebar');
    this.sidebar = sidebar;
    this.currentSidebarRoomCode = code;
    const roomCoords = this.roomsCoords[code] || { name: code };
    // Use all items in room (from getItemsByRoom) so sidebar list can be filtered by filterItems()
    const byRoom = this.getItemsByRoom();
    const roomItems = byRoom[code] || [];

    document.getElementById('room-title').textContent = code + ' — ' + roomCoords.name;

    sidebar.classList.remove('hidden');

    const list = document.getElementById('items-list');
    list.innerHTML = '';

    if (roomItems.length === 0) {
      list.innerHTML = '<div class="no-items">No items</div>';
      document.getElementById('items-count').textContent = '0 items';
    } else {
      roomItems.forEach(item => {
        try {
          const itemEl = this.createItemElement(item);
          list.appendChild(itemEl);
        } catch (err) {
          console.error('[App] createItemElement failed:', item.id, err);
        }
      });
      this.filterItems();
    }
  }

  createItemElement(item) {
    // === РАСШИРЕННАЯ ОТЛАДКА ===
    console.group('[DEBUG createItemElement] Item: ' + item.id);
    console.log('Full item object:', item);
    console.table({
      'ID': item.id,
      'Room Code': item.room_code,
      'Category': item.category,
      'Description': item.description,
      'Condition': item.condition,
      'Quantity': item.quantity,
      'Photo Count': item.photo_count
    });
    console.log('Photos array:', item.photos);
    console.groupEnd();

    const CONDITION_VALUES = ['Отличное', 'Хорошее', 'Удовлетворительное', 'Требует ремонта', 'Неисправно'];

    if (typeof item.quantity === 'string' && CONDITION_VALUES.includes(item.quantity)) {
      console.error('[createItemElement] quantity содержит состояние!', item.quantity);
      console.error('Проверьте Apps Script / Google Sheets — индексы колонок L и M могли быть перепутаны.');
    }

    // === ВРЕМЕННЫЙ FIX: swap перепутанных полей quantity ↔ condition ===
    let actualCondition = item.condition;
    let actualQuantity = item.quantity;
    let actualCategory = item.category;

    if (typeof item.quantity === 'string' && CONDITION_VALUES.includes(item.quantity)) {
      console.warn('[createItemElement] Swapping quantity ↔ condition');
      actualCondition = item.quantity;
      actualQuantity = item.condition;
    }

    actualQuantity = parseInt(actualQuantity, 10) || 1;

    if (actualCategory === item.room_code || !actualCategory || String(actualCategory).trim() === '') {
      console.warn('[createItemElement] Category is empty or equals room_code, using "unknown"');
      actualCategory = 'unknown';
    } else {
      actualCategory = String(actualCategory).trim();
    }

    // === СОЗДАНИЕ ЭЛЕМЕНТА ===
    const itemEl = document.createElement('div');
    itemEl.className = 'item item-card';

    itemEl.dataset.category = actualCategory;
    itemEl.dataset.condition = actualCondition || '';
    itemEl.dataset.roomCode = item.room_code || '';

    // === КАТЕГОРИЯ (цветной бейдж) ===
    const categoryColor = (CONFIG.CATEGORY_COLORS && CONFIG.CATEGORY_COLORS[actualCategory]) || '#999999';
    const CATEGORY_LABELS = {
      light: 'Light / Освещение',
      chandelier: 'Chandelier / Люстра',
      furniture: 'Furniture / Мебель',
      art: 'Art / Искусство',
      plumbing: 'Plumbing / Сантехника',
      carpet: 'Carpet / Ковёр',
      curtain: 'Curtain / Шторы',
      tech: 'Tech / Техника',
      spa: 'Spa / СПА',
      other: 'Other / Другое',
      unknown: '❓ Unknown'
    };
    const categoryBadge = document.createElement('div');
    categoryBadge.className = 'category-badge';
    categoryBadge.style.cssText = 'background-color:' + categoryColor + ';color:white;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:bold;display:inline-block;margin-bottom:8px;';
    categoryBadge.textContent = CATEGORY_LABELS[actualCategory] || actualCategory;

    // === КОД КОМНАТЫ ===
    const roomCodeEl = document.createElement('div');
    roomCodeEl.className = 'item-room-code';
    roomCodeEl.style.cssText = 'font-size:13px;font-weight:600;color:#888;margin-bottom:4px;';
    roomCodeEl.textContent = item.room_code || '—';

    // === ОПИСАНИЕ ===
    const descriptionEl = document.createElement('div');
    descriptionEl.className = 'item-description';
    descriptionEl.style.cssText = 'font-size:14px;color:#333;margin-bottom:8px;line-height:1.4;';
    descriptionEl.textContent = item.description || 'Без описания';

    // === СОСТОЯНИЕ ===
    const conditionEl = document.createElement('div');
    conditionEl.className = 'item-condition-wrap';
    conditionEl.style.cssText = 'font-size:13px;margin-bottom:6px;';
    const conditionLabel = document.createElement('span');
    conditionLabel.textContent = 'Состояние: ';
    conditionLabel.style.color = '#666';
    const conditionBadge = document.createElement('span');
    conditionBadge.className = 'condition-badge';
    const conditionColor = CONFIG.CONDITION_COLORS[actualCondition] || '#888';
    conditionBadge.style.cssText = 'background-color:#e3f2fd;color:#1976d2;padding:2px 8px;border-radius:3px;font-size:12px;font-weight:500;';
    if (conditionColor !== '#888') conditionBadge.style.backgroundColor = conditionColor;
    conditionBadge.textContent = actualCondition || '—';
    conditionEl.appendChild(conditionLabel);
    conditionEl.appendChild(conditionBadge);

    // === КОЛИЧЕСТВО ===
    const quantityEl = document.createElement('div');
    quantityEl.className = 'item-quantity';
    quantityEl.style.cssText = 'font-size:13px;color:#666;margin-bottom:8px;';
    quantityEl.innerHTML = '<strong>Qty:</strong> ' + actualQuantity;

    // === ФОТО ===
    const itemPhotos = document.createElement('div');
    itemPhotos.className = 'item-photos';
    itemPhotos.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;';

    const photos = (item.photos && Array.isArray(item.photos)) ? item.photos : [];
    photos.forEach((photoUrl, index) => {
      let urlStr = '';
      if (typeof photoUrl === 'string') urlStr = photoUrl;
      else if (photoUrl && typeof photoUrl === 'object' && photoUrl.url) urlStr = photoUrl.url;
      else if (photoUrl != null) urlStr = String(photoUrl);
      if (!urlStr || !urlStr.startsWith('http')) {
        console.warn('[createItemElement] Invalid photo ' + index + ':', photoUrl);
        return;
      }
      const img = document.createElement('img');
      const thumbnailUrl = this.getDriveThumbnail(urlStr);
      if (thumbnailUrl) {
        img.src = thumbnailUrl;
        img.className = 'item-photo item-thumb';
        img.alt = 'Photo ' + (index + 1);
        img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #ddd;cursor:pointer;transition:opacity 0.2s;';
        img.dataset.photoUrl = urlStr;
        img.onerror = () => {
          console.error('[createItemElement] Failed to load photo ' + index + ':', urlStr);
          img.style.display = 'none';
        };
        img.onclick = () => this.showPhoto(urlStr);
        itemPhotos.appendChild(img);
      }
    });

    // === СБОРКА ===
    itemEl.appendChild(categoryBadge);
    itemEl.appendChild(roomCodeEl);
    itemEl.appendChild(descriptionEl);
    itemEl.appendChild(conditionEl);
    itemEl.appendChild(quantityEl);
    itemEl.appendChild(itemPhotos);

    return itemEl;
  }

  getDriveThumbnail(url) {
    if (!url || typeof url !== 'string') return '';
    const normalized = convertDriveUrl(url);
    if (!normalized) return '';
    const match = normalized.match(/[?&]id=([a-zA-Z0-9_-]+)/) || normalized.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = match ? match[1] : null;
    if (fileId) return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400';
    return normalized || url;
  }

  showPhoto(url) {
    if (!url || typeof url !== 'string') {
      console.warn('showPhoto: no URL provided');
      return;
    }
    const normalized = convertDriveUrl(url);
    if (!normalized) return;
    const match = normalized.match(/[?&]id=([a-zA-Z0-9_-]+)/) || normalized.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = match ? match[1] : null;
    const fullUrl = fileId ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200' : normalized;

    console.log('Opening photo:', fullUrl);

    const img = document.getElementById('modal-photo');
    img.src = fullUrl;
    img.onerror = function () {
      console.error('Failed to load image:', fullUrl);
      img.alt = 'Failed to load image';
    };

    document.getElementById('photo-modal').classList.remove('hidden');
  }

  renderLegend() {
    const legend = document.getElementById('legend');
    const entries = Object.entries(CONFIG.CATEGORY_COLORS)
      .filter(([key]) => key !== 'empty')
      .map(([key, color]) => {
        const icon = CONFIG.CATEGORY_ICONS[key] || '';
        return '<span class="legend-item">' +
          '<span class="legend-color" style="background:' + color + '"></span> ' +
          icon + ' ' + key +
        '</span>';
      });
    legend.innerHTML = entries.join('');
  }

  updateStats(itemsCount, roomsCount) {
    document.getElementById('stats').textContent =
      'Showing: ' + itemsCount + ' items in ' + roomsCount + ' rooms';
  }

  showLoading() {
    document.getElementById('map-container').classList.add('loading');
  }

  hideLoading() {
    document.getElementById('map-container').classList.remove('loading');
  }

  showError(msg) {
    document.getElementById('stats').textContent = '⚠️ ' + msg;
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new App();
});
