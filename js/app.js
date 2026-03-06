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

    this.activeBuilding = (CONFIG.DEFAULT_BUILDING) || 'mc-1f';

    this.viewMode = 'map';

    this.filters = {
      category: '',
      condition: '',
      search: '',
      room: ''
    };

    this.init();
  }

  async init() {
    this.map = new FloorMap('map-container');
    this.map.onRoomSelect = (code) => this.showRoomDetails(code);

    const building = this._getBuilding(this.activeBuilding);

    // Set floor plan image and dimensions before loading rooms
    const floorPlanEl = document.getElementById('floor-plan');
    if (floorPlanEl && building.floorPlan) floorPlanEl.src = building.floorPlan;

    this.map.setFloorPlanDimensions(building.width, building.height);

    this.roomsCoords = await this._fetchRooms(building.roomsFile);

    this.map.setRooms(this.roomsCoords);

    await this.loadData();
    await this.waitForFloorPlanImage();

    this.setupFilters();
    this.setupSidebar();
    this.setupModal();
    this.setupLightbox();
    this.setupBuildingTabs();
    this.setupViewToggle();
    this.setupRoomFilter();
    this.renderLegend();

    this.applyFilters();
  }

  /** Returns building config for a given key; falls back to mc-1f. */
  _getBuilding(key) {
    const buildings = (CONFIG.BUILDINGS) || {};
    return buildings[key] || buildings['mc-1f'] || {
      label: key,
      floorPlan: CONFIG.FLOOR_PLAN || 'assets/floor-plan-mc.png',
      width: CONFIG.FLOOR_PLAN_WIDTH || 1545,
      height: CONFIG.FLOOR_PLAN_HEIGHT || 763,
      roomsFile: 'data/rooms-mc-1f.json',
      buildingId: 1
    };
  }

  /** Fetch rooms JSON; returns {} on error (e.g. empty stubs for new buildings). */
  async _fetchRooms(roomsFile) {
    if (!roomsFile) return {};
    try {
      // Добавляем timestamp, чтобы браузер всегда качал свежий JSON
      const res = await fetch(roomsFile + '?nocache=' + Date.now());
      if (!res.ok) return {};
      return await res.json();
    } catch (e) {
      console.warn('[App] Could not load', roomsFile, e);
      return {};
    }
  }

  /**
   * Returns true when the item belongs to the currently active building/floor.
   * For MC 1F and MC 2F (both building_id=1) we also check that the room_code
   * is present in the active roomsCoords — this splits the two floors cleanly.
   */
  itemBelongsToBuilding(item) {
    const building = this._getBuilding(this.activeBuilding);
    const itemBuildingId = item.building_id !== undefined && item.building_id !== null && item.building_id !== ''
      ? parseInt(item.building_id, 10)
      : null;

    // If API did not return building_id at all — show everything (mock data / legacy)
    if (itemBuildingId === null || isNaN(itemBuildingId)) return true;

    if (itemBuildingId !== building.buildingId) return false;

    // For buildings that have multiple floor tabs (same buildingId), discriminate by room_code.
    // This handles MC, MV (1f/2f) and SG (lower/upper) — any buildingId shared by 2+ tabs.
    const allBuildings = Object.values((CONFIG.BUILDINGS) || {});
    const floorsForId = allBuildings.filter(b => b.buildingId === building.buildingId);
    if (floorsForId.length > 1) {
      const code = item.room_code || this.roomIdToCode[item.room_id];
      if (!code) return false;
      return Object.prototype.hasOwnProperty.call(this.roomsCoords, code);
    }

    return true;
  }

  /** Switch active building tab: load new rooms, update floor plan, rerender. */
  async switchBuilding(buildingKey) {
    if (buildingKey === this.activeBuilding) return;

    this.activeBuilding = buildingKey;
    const mapBtn = document.querySelector('.view-btn[data-view="map"]');
    const viewToggle = document.querySelector('.view-toggle');
    const buildingConfig = (CONFIG.BUILDINGS || {})[buildingKey] || {};
    const isStorage = CONFIG.STORAGE_BUILDING_IDS &&
      CONFIG.STORAGE_BUILDING_IDS.includes(buildingConfig.buildingCode);

    if (buildingKey === 'all') {
      // Force list view and disable map button
      if (this.viewMode !== 'list') {
        this.viewMode = 'list';
        document.querySelectorAll('.view-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.view === 'list'));
        document.querySelector('.map-container').classList.add('hidden');
        document.getElementById('list-container').classList.remove('hidden');
      }
      if (mapBtn) mapBtn.disabled = true;
      if (viewToggle) viewToggle.style.display = '';
    } else if (isStorage) {
      // Storage: force list view, hide the map/list toggle entirely
      this.viewMode = 'list';
      document.querySelectorAll('.view-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.view === 'list'));
      document.querySelector('.map-container').classList.add('hidden');
      document.getElementById('list-container').classList.remove('hidden');
      if (mapBtn) mapBtn.disabled = true;
      if (viewToggle) viewToggle.style.display = 'none';
      this.roomsCoords = {};
    } else {
      // Regular building: re-enable toggle
      const wasForced = mapBtn && mapBtn.disabled;
      if (mapBtn) mapBtn.disabled = false;
      if (viewToggle) viewToggle.style.display = '';

      // If we were in a forced-list mode (storage/all), restore map view
      if (wasForced) {
        this.viewMode = 'map';
        document.querySelectorAll('.view-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.view === 'map'));
        document.querySelector('.map-container').classList.remove('hidden');
        document.getElementById('list-container').classList.add('hidden');
      }

      const building = this._getBuilding(buildingKey);

      // Update floor plan image
      const floorPlanEl = document.getElementById('floor-plan');
      if (floorPlanEl) floorPlanEl.src = building.floorPlan;

      // Load room coords for this building
      this.roomsCoords = await this._fetchRooms(building.roomsFile);

      // Update map
      this.map.setFloorPlanDimensions(building.width, building.height);
      this.map.setRooms(this.roomsCoords);
    }

    // Reset room filter for new building
    this.filters.room = '';
    const roomSelect = document.getElementById('filter-room');
    if (roomSelect) roomSelect.value = '';
    this.updateRoomFilterOptions();

    // Close sidebar
    document.getElementById('sidebar').classList.add('hidden');

    // Update tab highlight
    document.querySelectorAll('#building-tabs .tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.building === buildingKey);
    });

    // Rerender
    this.applyFilters();
  }

  /** Toggle between map and list view modes. */
  setupViewToggle() {
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const view = btn.dataset.view;
        if (view === this.viewMode) return;
        this.viewMode = view;
        document.querySelectorAll('.view-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.view === view));
        const mapContainer = document.querySelector('.map-container');
        const listContainer = document.getElementById('list-container');
        if (view === 'list') {
          mapContainer.classList.add('hidden');
          listContainer.classList.remove('hidden');
          this.renderListView();
        } else {
          mapContainer.classList.remove('hidden');
          listContainer.classList.add('hidden');
        }
      });
    });
  }

  /** Wire up room filter dropdown. */
  setupRoomFilter() {
    const roomSelect = document.getElementById('filter-room');
    if (!roomSelect) return;
    this.updateRoomFilterOptions();
    roomSelect.addEventListener('change', (e) => {
      this.filters.room = e.target.value;
      this.applyFilters();
    });
  }

  /** Repopulate room filter options from current building's roomsCoords (or all rooms for 'all' tab). */
  updateRoomFilterOptions() {
    const roomSelect = document.getElementById('filter-room');
    if (!roomSelect) return;
    const currentVal = roomSelect.value;
    roomSelect.innerHTML = '<option value="">Все комнаты</option>';

    if (this.activeBuilding === 'all') {
      // All rooms from API, sorted by code
      [...this.rooms].filter(r => r.code).sort((a, b) =>
        (a.code || '').localeCompare(b.code || '')).forEach(room => {
        const opt = document.createElement('option');
        opt.value = room.code;
        opt.textContent = room.code + (room.name ? ' — ' + room.name : '');
        if (room.code === currentVal) opt.selected = true;
        roomSelect.appendChild(opt);
      });
    } else {
      Object.keys(this.roomsCoords).sort().forEach(code => {
        const name = this.roomsCoords[code] && this.roomsCoords[code].name
          ? this.roomsCoords[code].name : '';
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = code + (name ? ' — ' + name : '');
        if (code === currentVal) opt.selected = true;
        roomSelect.appendChild(opt);
      });
    }
  }

  /** Render the list view table for the current building + active filters. */
  renderListView() {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const isAll = this.activeBuilding === 'all';
    const buildingConfig = (CONFIG.BUILDINGS || {})[this.activeBuilding] || {};
    const isStorage = !isAll && CONFIG.STORAGE_BUILDING_IDS &&
      CONFIG.STORAGE_BUILDING_IDS.includes(buildingConfig.buildingCode);
    const BUILDING_NAMES = { 1: 'MC', 2: 'ENT', 4: 'MV', 5: 'SG' };

    // Manage "Здание" column header
    const theadRow = document.querySelector('#inventory-table thead tr');
    if (theadRow) {
      const existingTh = theadRow.querySelector('.th-building');
      if (isAll && !existingTh) {
        const th = document.createElement('th');
        th.className = 'th-building';
        th.textContent = 'Здание';
        theadRow.insertBefore(th, theadRow.firstChild);
      } else if (!isAll && existingTh) {
        existingTh.remove();
      }
    }

    // Build room name lookup: code → name (API rooms + current roomsCoords)
    const roomNameByCode = {};
    this.rooms.forEach(r => { if (r.code) roomNameByCode[r.code] = r.name || ''; });
    Object.entries(this.roomsCoords).forEach(([code, data]) => {
      if (data && data.name) roomNameByCode[code] = data.name;
    });

    const roomsInList = new Set();
    const buildingsInList = new Set();

    const filtered = this.items.filter(item => {
      if (!isAll && !isStorage && !this.itemBelongsToBuilding(item)) return false;
      if (isStorage && buildingConfig.buildingCode) {
        const itemCode = item.room_code || this.roomIdToCode[item.room_id] || '';
        if (!itemCode.toUpperCase().startsWith(buildingConfig.buildingCode.toUpperCase())) return false;
      }
      const norm = this.normalizeItemFields(item);
      const code = item.room_code || this.roomIdToCode[item.room_id] || '';
      const filterCat = (this.filters.category && String(this.filters.category).trim()) || '';
      if (filterCat && norm.category !== filterCat) return false;
      if (this.filters.condition && (norm.condition || '') !== this.filters.condition) return false;
      if (this.filters.room && code !== this.filters.room) return false;
      if (this.filters.search) {
        const s = this.filters.search.toLowerCase();
        const roomName = (roomNameByCode[code] || '').toLowerCase();
        if (!(item.description || '').toLowerCase().includes(s) &&
            !roomName.includes(s) && !code.toLowerCase().includes(s)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (isAll) {
        const ba = parseInt(a.building_id, 10) || 0;
        const bb = parseInt(b.building_id, 10) || 0;
        if (ba !== bb) return ba - bb;
      }
      const ca = (a.room_code || this.roomIdToCode[a.room_id] || '').toLowerCase();
      const cb = (b.room_code || this.roomIdToCode[b.room_id] || '').toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      return this.normalizeItemFields(a).category.localeCompare(
        this.normalizeItemFields(b).category);
    });

    filtered.forEach(item => {
      const norm = this.normalizeItemFields(item);
      const code = item.room_code || this.roomIdToCode[item.room_id] || '';
      const roomName = roomNameByCode[code] || '';
      if (code) roomsInList.add(code);
      if (isAll && item.building_id) buildingsInList.add(parseInt(item.building_id, 10));

      const tr = document.createElement('tr');

      // Building (only in 'all' mode)
      if (isAll) {
        const tdBuilding = document.createElement('td');
        const buildingId = parseInt(item.building_id, 10);
        tdBuilding.textContent = BUILDING_NAMES[buildingId] || (item.building_name || ('ID:' + buildingId));
        tdBuilding.style.cssText = 'font-weight:500;color:#aaa;white-space:nowrap';
        tr.appendChild(tdBuilding);
      }

      // Room
      const tdRoom = document.createElement('td');
      tdRoom.innerHTML = '<strong>' + (code || '—') + '</strong>' +
        (roomName ? '<br><span class="list-room-name">' + roomName + '</span>' : '');
      tr.appendChild(tdRoom);

      // Category
      const tdCat = document.createElement('td');
      const icon = (CONFIG.CATEGORY_ICONS && CONFIG.CATEGORY_ICONS[norm.category]) || '';
      const catColor = (CONFIG.CATEGORY_COLORS && CONFIG.CATEGORY_COLORS[norm.category]) || '#999';
      tdCat.innerHTML = '<span class="list-cat-badge" style="background:' + catColor +
        ';color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;white-space:nowrap">' +
        icon + ' ' + norm.category + '</span>';
      tr.appendChild(tdCat);

      // Description
      const tdDesc = document.createElement('td');
      const desc = item.description || '—';
      tdDesc.textContent = desc.length > 80 ? desc.slice(0, 80) + '…' : desc;
      tdDesc.title = desc;
      tr.appendChild(tdDesc);

      // Condition
      const tdCond = document.createElement('td');
      const condColor = (CONFIG.CONDITION_COLORS && CONFIG.CONDITION_COLORS[norm.condition]) || '#888';
      let condHtml = '<span class="list-cond-badge" style="background:' + condColor +
        ';color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;white-space:nowrap">' +
        (norm.condition || '—') + '</span>';
      if (norm.repair_status) {
        const rColors = { pending: '#F39C12', in_progress: '#E67E22', done: '#27AE60' };
        const rColor = rColors[norm.repair_status] || '#F39C12';
        condHtml += ' <span style="background:' + rColor +
          ';color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;vertical-align:middle">🔧</span>';
      }
      tdCond.innerHTML = condHtml;
      tr.appendChild(tdCond);

      // Quantity
      const tdQty = document.createElement('td');
      tdQty.textContent = norm.quantity;
      tdQty.style.textAlign = 'center';
      tr.appendChild(tdQty);

      // Photos
      const tdPhoto = document.createElement('td');
      const photos = Array.isArray(item.photos) ? item.photos.filter(p => {
        const u = typeof p === 'string' ? p : (p && p.url ? p.url : '');
        return u && u.startsWith('http');
      }) : [];
      const listPhotoUrls = photos.map(p => typeof p === 'string' ? p : p.url);
      const nameplateUrl = (item.nameplate_photo && item.nameplate_photo.startsWith('http')) ? item.nameplate_photo : null;
      if (nameplateUrl) listPhotoUrls.push(nameplateUrl);
      if (listPhotoUrls.length) {
        const link = document.createElement('span');
        link.className = 'list-photo-link';
        link.textContent = '📷 ' + listPhotoUrls.length;
        link.addEventListener('click', () => this.openLightbox(listPhotoUrls, 0));
        tdPhoto.appendChild(link);
      } else {
        tdPhoto.textContent = '—';
      }
      tr.appendChild(tdPhoto);

      // Date
      const tdDate = document.createElement('td');
      tdDate.className = 'list-date';
      if (item.created_at) {
        try { tdDate.textContent = new Date(item.created_at).toLocaleDateString('ru-RU'); }
        catch (e) { tdDate.textContent = item.created_at; }
      } else {
        tdDate.textContent = '—';
      }
      tr.appendChild(tdDate);

      tbody.appendChild(tr);
    });

    const listStats = document.getElementById('list-stats');
    if (listStats) {
      listStats.textContent = isAll
        ? 'Показано: ' + filtered.length + ' предметов в ' + roomsInList.size + ' комнатах (' + buildingsInList.size + ' здания)'
        : 'Показано: ' + filtered.length + ' предметов в ' + roomsInList.size + ' комнатах';
    }

    if (isAll) this.updateStats(filtered.length, roomsInList.size);

    // Render category chips for storage view
    const chipsEl = document.getElementById('category-chips');
    if (chipsEl) {
      if (isStorage && buildingConfig.buildingCode) {
        // Count all storage items per category (unfiltered, to show totals)
        const catCounts = {};
        let storageTotal = 0;
        this.items.forEach(item => {
          const itemCode = item.room_code || this.roomIdToCode[item.room_id] || '';
          if (!itemCode.toUpperCase().startsWith(buildingConfig.buildingCode.toUpperCase())) return;
          const norm = this.normalizeItemFields(item);
          catCounts[norm.category] = (catCounts[norm.category] || 0) + 1;
          storageTotal++;
        });

        const activeCat = this.filters.category || '';
        let html = '<button class="chip' + (!activeCat ? ' active' : '') + '" data-cat="">Все (' + storageTotal + ')</button>';
        Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
          const color = (CONFIG.CATEGORY_COLORS && CONFIG.CATEGORY_COLORS[cat]) || '#999';
          const icon = (CONFIG.CATEGORY_ICONS && CONFIG.CATEGORY_ICONS[cat]) || '';
          html += '<button class="chip' + (activeCat === cat ? ' active' : '') +
            '" data-cat="' + cat + '" style="border-color:' + color + ';--chip-color:' + color + '">' +
            icon + ' ' + cat + ' (' + count + ')</button>';
        });
        chipsEl.innerHTML = html;
        chipsEl.style.display = '';

        chipsEl.querySelectorAll('.chip').forEach(btn => {
          btn.addEventListener('click', () => {
            this.filters.category = btn.dataset.cat;
            const catSelect = document.getElementById('filter-category');
            if (catSelect) catSelect.value = this.filters.category;
            this.applyFilters();
          });
        });
      } else {
        chipsEl.style.display = 'none';
        chipsEl.innerHTML = '';
      }
    }
  }

  /** Wire up click events for building tab buttons. */
  setupBuildingTabs() {
    const nav = document.getElementById('building-tabs');
    if (!nav) return;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      const key = btn.dataset.building;
      if (key) this.switchBuilding(key);
    });
  
    // Подсветить активный таб при загрузке
    document.querySelectorAll('#building-tabs .tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.building === this.activeBuilding);
    });
  }

  async loadData() {
    this.showLoading();
    window._apiUnavailable = false;

    try {
      this.rooms = await api.getRooms();
      this.items = await api.getItems();

      this.rooms.forEach(room => {
        this.roomIdToCode[room.id] = room.code;
      });
    } catch (e) {
      console.error('Data loading error:', e);
      this.showError('Failed to load data. Check API settings.');
    }

    const banner = document.getElementById('api-warning');
    if (banner) banner.style.display = window._apiUnavailable ? 'block' : 'none';

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

  /** Нормализация полей item: quantity → int, category → строка. */
  normalizeItemFields(item) {
    const condition = item.condition;
    const quantity = parseInt(item.quantity, 10) || 1;
    let category = (item.category && String(item.category).trim()) || 'unknown';
    if (category === item.room_code || !category) category = 'unknown';
    return {
      condition, quantity, category,
      serial_model: item.serial_model || '',
      nameplate_photo: item.nameplate_photo || '',
      repair_status: item.repair_status || '',
    };
  }

  getItemsByRoom() {
    const byRoom = {};

    this.items.forEach(item => {
      // Skip items that don't belong to the currently active building/floor
      if (!this.itemBelongsToBuilding(item)) return;

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
    const _activeBuildingConfig = (CONFIG.BUILDINGS || {})[this.activeBuilding] || {};
    const _isStorageTab = CONFIG.STORAGE_BUILDING_IDS &&
      CONFIG.STORAGE_BUILDING_IDS.includes(_activeBuildingConfig.buildingCode);

    // 'all' tab and storage tabs: skip map operations entirely, just render list
    if (this.activeBuilding === 'all' || _isStorageTab) {
      if (this.viewMode === 'list') this.renderListView();
      return;
    }

    const itemsByRoom = this.getItemsByRoom();
    const roomsData = {};
    let totalItems = 0;
    let visibleRooms = 0;

    Object.keys(this.roomsCoords).forEach(code => {
      if (this.filters.room && code !== this.filters.room) {
        roomsData[code] = { items: [], dominantCategory: 'empty' };
        return;
      }

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

    if (this.viewMode === 'list') this.renderListView();
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

  setupLightbox() {
    document.getElementById('lightbox-close').addEventListener('click', () => this.closeLightbox());
    document.getElementById('lightbox').addEventListener('click', (e) => {
      if (e.target.id === 'lightbox') this.closeLightbox();
    });
    document.getElementById('lightbox-prev').addEventListener('click', () => this._lightboxNav(-1));
    document.getElementById('lightbox-next').addEventListener('click', () => this._lightboxNav(1));

    document.addEventListener('keydown', (e) => {
      if (!document.getElementById('lightbox').classList.contains('lightbox-open')) return;
      if (e.key === 'Escape') this.closeLightbox();
      else if (e.key === 'ArrowLeft') this._lightboxNav(-1);
      else if (e.key === 'ArrowRight') this._lightboxNav(1);
    });
  }

  openLightbox(photos, index) {
    this._lbPhotos = photos;
    this._lbIndex = index;
    this._lightboxUpdate();
    document.getElementById('lightbox').classList.add('lightbox-open');
  }

  closeLightbox() {
    document.getElementById('lightbox').classList.remove('lightbox-open');
  }

  _lightboxNav(dir) {
    const len = this._lbPhotos.length;
    this._lbIndex = (this._lbIndex + dir + len) % len;
    this._lightboxUpdate();
  }

  _lightboxUpdate() {
    const url = this._lbPhotos[this._lbIndex];
    document.getElementById('lightbox-img').src = this._getFullPhotoUrl(url);
    const total = this._lbPhotos.length;
    document.getElementById('lightbox-counter').textContent = (this._lbIndex + 1) + ' / ' + total;
    const prev = document.getElementById('lightbox-prev');
    const next = document.getElementById('lightbox-next');
    prev.classList.toggle('hidden', total <= 1);
    next.classList.toggle('hidden', total <= 1);
  }

  _getFullPhotoUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const normalized = convertDriveUrl(url);
    if (!normalized) return url;
    const match = normalized.match(/[?&]id=([a-zA-Z0-9_-]+)/) || normalized.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = match ? match[1] : null;
    return fileId ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200' : normalized;
  }

  showRoomDetails(code) {
    const sidebar = document.getElementById('sidebar');
    this.sidebar = sidebar;
    this.currentSidebarRoomCode = code;
    const roomCoords = this.roomsCoords[code] || { name: code };
    // Show ALL items in the room when a room is clicked — do not apply global filters.
    // Users expect to see the full room inventory. Filters only affect the map (which rooms/pins are visible).
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
      // Do NOT call filterItems() — sidebar shows full room inventory regardless of map filters.
      document.getElementById('items-count').textContent = roomItems.length + ' items';
    }
  }

  createItemElement(item) {
    const norm = this.normalizeItemFields(item);
    const actualCondition = norm.condition;
    const actualQuantity = parseInt(norm.quantity, 10) || 1;
    const actualCategory = norm.category;

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
    categoryBadge.className = 'item-category';
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

    // === РЕМОНТ (badge) ===
    let repairEl = null;
    if (norm.repair_status) {
      repairEl = document.createElement('div');
      repairEl.style.cssText = 'font-size:12px;font-weight:600;margin-top:4px;margin-bottom:6px;';
      const badgeMap = {
        pending:     { icon: '🔧', color: '#F39C12', label: 'Ремонт ожидает' },
        in_progress: { icon: '🔧', color: '#E67E22', label: 'В ремонте' },
        done:        { icon: '✅', color: '#27AE60', label: 'Ремонт завершён' },
      };
      const b = badgeMap[norm.repair_status] || { icon: '🔧', color: '#F39C12', label: norm.repair_status };
      repairEl.innerHTML = `<span style="background:${b.color};color:#fff;padding:2px 8px;border-radius:4px">${b.icon} ${b.label}</span>`;
    }

    // === ФОТО ===
    const itemPhotos = document.createElement('div');
    itemPhotos.className = 'item-photos';
    itemPhotos.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;';

    const rawPhotos = (item.photos && Array.isArray(item.photos)) ? item.photos : [];
    const allPhotoUrls = [];
    rawPhotos.forEach(photoUrl => {
      let urlStr = '';
      if (typeof photoUrl === 'string') urlStr = photoUrl;
      else if (photoUrl && typeof photoUrl === 'object' && photoUrl.url) urlStr = photoUrl.url;
      else if (photoUrl != null) urlStr = String(photoUrl);
      if (urlStr && urlStr.startsWith('http')) allPhotoUrls.push(urlStr);
    });
    if (norm.nameplate_photo && norm.nameplate_photo.startsWith('http')) {
      allPhotoUrls.push(norm.nameplate_photo);
    }

    allPhotoUrls.forEach((urlStr, index) => {
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
        img.onclick = () => this.openLightbox(allPhotoUrls, index);
        itemPhotos.appendChild(img);
      }
    });

    // === СБОРКА ===
    itemEl.appendChild(categoryBadge);
    itemEl.appendChild(roomCodeEl);
    itemEl.appendChild(descriptionEl);
    itemEl.appendChild(conditionEl);
    itemEl.appendChild(quantityEl);
    if (repairEl) itemEl.appendChild(repairEl);
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
    if (!url || typeof url !== 'string') return;
    const normalized = convertDriveUrl(url);
    if (!normalized) return;
    const match = normalized.match(/[?&]id=([a-zA-Z0-9_-]+)/) || normalized.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const fileId = match ? match[1] : null;
    const fullUrl = fileId ? 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200' : normalized;

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
