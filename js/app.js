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
        const itemCat = (item.category && String(item.category).trim()) || 'unknown';
        const filterCat = (this.filters.category && String(this.filters.category).trim()) || '';
        if (filterCat && itemCat !== filterCat) return false;
        if (this.filters.condition && (item.condition || '') !== this.filters.condition) return false;
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
    // 🔍 ОТЛАДКА: проверка структуры данных из API
    console.log('[DEBUG createItemElement] Item data:', {
      id: item.id,
      room_code: item.room_code,
      category: item.category,
      category_type: typeof item.category,
      description: item.description,
      condition: item.condition,
      quantity: item.quantity,
      photos: item.photos,
      photo_count: item.photo_count
    });

    const itemEl = document.createElement('div');
    itemEl.className = 'item-card item';

    const categoryName = (item.category && String(item.category).trim()) || 'unknown';
    itemEl.dataset.category = categoryName;
    itemEl.dataset.condition = item.condition || '';
    itemEl.dataset.roomCode = item.room_code || '';

    const categoryColor = (CONFIG.CATEGORY_COLORS && CONFIG.CATEGORY_COLORS[categoryName]) || '#95A5A6';
    const conditionColor = CONFIG.CONDITION_COLORS[item.condition] || '#888';
    const icon = CONFIG.CATEGORY_ICONS[categoryName] || CONFIG.CATEGORY_ICONS.other || '❓';

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
      unknown: '? Unknown'
    };
    const categoryLabel = CATEGORY_LABELS[categoryName] || categoryName;

    const header = document.createElement('div');
    header.className = 'item-header';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'item-icon';
    iconSpan.textContent = icon;
    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'category-badge';
    categoryBadge.style.backgroundColor = categoryColor;
    categoryBadge.style.color = '#fff';
    categoryBadge.style.padding = '4px 8px';
    categoryBadge.style.borderRadius = '4px';
    categoryBadge.style.fontSize = '12px';
    categoryBadge.style.fontWeight = 'bold';
    categoryBadge.style.display = 'inline-block';
    categoryBadge.style.marginBottom = '8px';
    categoryBadge.textContent = categoryLabel;
    const conditionSpan = document.createElement('span');
    conditionSpan.className = 'item-condition';
    conditionSpan.style.backgroundColor = conditionColor;
    conditionSpan.textContent = item.condition || '—';
    header.appendChild(iconSpan);
    header.appendChild(categoryBadge);
    header.appendChild(conditionSpan);

    const body = document.createElement('div');
    body.className = 'item-body';
    const roomCodeEl = document.createElement('div');
    roomCodeEl.className = 'item-room-code';
    roomCodeEl.style.fontSize = '14px';
    roomCodeEl.style.fontWeight = 'bold';
    roomCodeEl.style.color = '#666';
    roomCodeEl.style.marginBottom = '4px';
    roomCodeEl.textContent = item.room_code || '—';
    body.appendChild(roomCodeEl);
    const description = document.createElement('div');
    description.className = 'item-description';
    description.textContent = item.description || '—';
    const quantity = document.createElement('div');
    quantity.className = 'item-quantity';
    quantity.textContent = 'Qty: ' + (item.quantity || 1);
    body.appendChild(description);
    body.appendChild(quantity);

    const itemPhotos = document.createElement('div');
    itemPhotos.className = 'item-photos';
    const photos = (item.photos && Array.isArray(item.photos)) ? item.photos : [];
    if (photos.length > 0) {
      photos.forEach(photoUrl => {
        const urlStr = typeof photoUrl === 'string'
          ? photoUrl
          : (photoUrl && typeof photoUrl === 'object' && photoUrl.url)
            ? photoUrl.url
            : (photoUrl != null ? String(photoUrl) : '');
        if (!urlStr || !urlStr.startsWith('http')) return;
        const img = document.createElement('img');
        const thumbUrl = this.getDriveThumbnail(urlStr);
        img.src = thumbUrl;
        img.className = 'item-photo item-thumb';
        img.alt = 'Item photo';
        img.dataset.photoUrl = urlStr;
        img.onerror = () => {
          console.error('[App] Failed to load photo:', urlStr);
          img.style.display = 'none';
        };
        itemPhotos.appendChild(img);
      });
    }
    body.appendChild(itemPhotos);

    itemEl.appendChild(header);
    itemEl.appendChild(body);
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
