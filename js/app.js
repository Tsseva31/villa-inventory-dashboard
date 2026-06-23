// app.js — Initialization, state, UI logic

// Bot deeplink base URL
const BOT_DEEPLINK = 'https://t.me/villa_inventory_bot?start=';

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
    this.storageItems = [];
    this.ownerRequests = [];
    this.repairRequests = [];
    this.movementLog = [];
    this.roomsCoords = {};
    this.roomIdToCode = {};
    this.roomIdToZoneId = {};

    this.activeBuilding = (CONFIG.DEFAULT_BUILDING) || 'mc';

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
    this.map.onRoomSelect = (code) => this.openRoomView(code);
    this.map.onRequestBadgeClick = (code) => this.navigateToRequestForRoom(code);

    const building = this._getBuilding(this.activeBuilding);

    // Set floor plan image before loading data
    const floorPlanEl = document.getElementById('floor-plan');
    if (floorPlanEl && building.hasFloorPlan && building.floorPlan) {
      floorPlanEl.src = building.floorPlan;
    }

    await this.loadData();
    this.rebuildRoomsCoordsFromApi();
    this.map.setRooms(this.roomsCoords);

    if (building.hasFloorPlan && building.floorPlan) {
      await this.waitForFloorPlanImage();
      this.syncFloorPlanDimensionsFromImage(building);
    } else {
      this.map.setRooms({});
      this.map.setFloorPlanDimensions(1, 1);
    }

    this.setupFilters();
    this.setupRoomView();
    this.setupModal();
    this.setupLightbox();
    this.setupBuildingTabs();

    const reqStatusFilter = document.getElementById('requests-status-filter');
    if (reqStatusFilter) {
      reqStatusFilter.addEventListener('change', () => this.renderOwnerRequests());
    }

    this.setupViewToggle();
    this.setupRoomFilter();
    this.renderLegend();

    this.applyFilters();
    this.updateStatsHeader();
  }

  /** Returns building config for a given key; falls back to default building. */
  _getBuilding(key) {
    const buildings = (CONFIG.BUILDINGS) || {};
    var defaultKey = CONFIG.DEFAULT_BUILDING || 'mc';
    return buildings[key] || CONFIG.BUILDINGS[defaultKey];
  }

  /**
   * Returns true when item belongs to the active building tab.
   * Tabs can additionally filter by zone_id via buildingConfig.zoneFilter.
   */
  itemBelongsToBuilding(item) {
    const building = this._getBuilding(this.activeBuilding);
    let itemBuildingId = null;
    if (item.building_id !== undefined && item.building_id !== null && item.building_id !== '') {
      const parsed = parseInt(item.building_id, 10);
      if (!isNaN(parsed)) itemBuildingId = parsed;
    }
    if (itemBuildingId === null) {
      const itemZoneRaw = item.zone_id !== undefined && item.zone_id !== null && item.zone_id !== ''
        ? item.zone_id
        : this.roomIdToZoneId[item.room_id];
      const itemZone = itemZoneRaw !== undefined && itemZoneRaw !== null && itemZoneRaw !== ''
        ? parseInt(itemZoneRaw, 10)
        : NaN;
      if (!isNaN(itemZone)) itemBuildingId = Math.floor(itemZone / 100);
    }
    if (itemBuildingId === null || isNaN(itemBuildingId)) return false;

    if (itemBuildingId !== building.buildingId) return false;

    if (building.zoneFilter !== null && building.zoneFilter !== undefined) {
      const itemZone = item.zone_id !== undefined && item.zone_id !== null && item.zone_id !== ''
        ? parseInt(item.zone_id, 10)
        : parseInt(this.roomIdToZoneId[item.room_id], 10);
      if (isNaN(itemZone) || itemZone !== building.zoneFilter) return false;
    }

    return true;
  }

  /** Build map room coords from API rooms for current building/zone. */
  rebuildRoomsCoordsFromApi() {
    const building = this._getBuilding(this.activeBuilding);
    if (!building || this.activeBuilding === 'all') {
      this.roomsCoords = {};
      return;
    }

    const roomsCoords = {};
    this.rooms.forEach(room => {
      const roomZoneId = room.zone_id !== undefined && room.zone_id !== null && room.zone_id !== ''
        ? parseInt(room.zone_id, 10)
        : NaN;
      if (isNaN(roomZoneId)) return;
      const roomBuildingIdFromZone = Math.floor(roomZoneId / 100);
      if (roomBuildingIdFromZone !== building.buildingId) return;
      if (building.zoneFilter !== null && building.zoneFilter !== undefined) {
        if (roomZoneId !== building.zoneFilter) return;
      }
      const px = parseFloat(room.pin_x);
      const py = parseFloat(room.pin_y);
      if (!room.code || isNaN(px) || isNaN(py)) return;
      roomsCoords[room.code] = {
        name: room.name || room.code,
        x: px,
        y: py
      };
    });

    this.roomsCoords = roomsCoords;
  }

  syncFloorPlanDimensionsFromImage(building) {
    const floorPlanEl = document.getElementById('floor-plan');
    if (!floorPlanEl) return;
    const configuredWidth = building && Number(building.planWidth) > 0 ? Number(building.planWidth) : null;
    const configuredHeight = building && Number(building.planHeight) > 0 ? Number(building.planHeight) : null;
    const naturalWidth = floorPlanEl.naturalWidth || floorPlanEl.width || null;
    const naturalHeight = floorPlanEl.naturalHeight || floorPlanEl.height || null;
    const width = configuredWidth || naturalWidth || 1;
    const height = configuredHeight || naturalHeight || 1;
    this.map.setFloorPlanDimensions(width, height);
  }

  /** Switch active building tab: update floor plan/list mode and rerender. */
  async switchBuilding(buildingKey) {
    if (buildingKey === 'requests') {
      document.getElementById('room-view-container')?.classList.add('hidden');
      if (this.viewMode === 'room') {
        this.map.selectedCode = null;
        this.currentSidebarRoomCode = null;
      }

      if (buildingKey === this.activeBuilding) return;
      this.activeBuilding = 'requests';
      this.viewMode = 'list';

      document.querySelectorAll('#building-tabs .tab-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.building === 'requests'));

      document.querySelector('.map-container').classList.add('hidden');
      document.getElementById('list-container').classList.add('hidden');
      const viewToggle = document.querySelector('.view-toggle');
      if (viewToggle) viewToggle.style.display = 'none';
      const filtersRowInit = document.querySelector('.filters');
      if (filtersRowInit) filtersRowInit.style.display = 'none';

      const reqContainer = document.getElementById('requests-container');
      if (reqContainer) reqContainer.classList.remove('hidden');

      this.renderOwnerRequests();
      this.updateStatsHeader();
      return;
    }

    if (buildingKey === this.activeBuilding) return;

    document.getElementById('room-view-container')?.classList.add('hidden');
    if (this.viewMode === 'room') {
      this.map.selectedCode = null;
      this.currentSidebarRoomCode = null;
    }

    const reqContainer = document.getElementById('requests-container');
    if (reqContainer) reqContainer.classList.add('hidden');
    const filtersRow = document.querySelector('.filters');
    if (filtersRow) filtersRow.style.display = '';

    this.activeBuilding = buildingKey;
    const mapBtn = document.querySelector('.view-btn[data-view="map"]');
    const viewToggle = document.querySelector('.view-toggle');
    const buildingConfig = this._getBuilding(buildingKey) || {};
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
      if (mapBtn) {
        mapBtn.disabled = true;
        mapBtn.title = 'Карта недоступна в режиме "Все"';
      }
      if (viewToggle) viewToggle.style.display = '';
    } else if (isStorage) {
      // Storage: force list view, hide the map/list toggle entirely
      this.viewMode = 'list';
      document.querySelectorAll('.view-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.view === 'list'));
      document.querySelector('.map-container').classList.add('hidden');
      document.getElementById('list-container').classList.remove('hidden');
      if (mapBtn) mapBtn.disabled = true;
      if (mapBtn) mapBtn.title = 'Карта недоступна для склада';
      if (viewToggle) viewToggle.style.display = 'none';
      this.roomsCoords = {};
    } else {
      // Regular building: re-enable toggle
      const wasForced = mapBtn && mapBtn.disabled;
      if (mapBtn) {
        mapBtn.disabled = false;
        mapBtn.title = 'Карта';
      }
      if (viewToggle) viewToggle.style.display = '';

      const noFloorPlan = buildingConfig.hasFloorPlan === false || !buildingConfig.floorPlan;

      // If no floor plan yet, force list mode and disable map button
      if (noFloorPlan) {
        this.viewMode = 'list';
        document.querySelectorAll('.view-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.view === 'list'));
        document.querySelector('.map-container').classList.add('hidden');
        document.getElementById('list-container').classList.remove('hidden');
        if (mapBtn) {
          mapBtn.disabled = true;
          mapBtn.title = 'План помещений в подготовке';
        }
        this.updateStats(0, 0);
        this.showError('План помещений в подготовке');
        this.map.setRooms({});
        this.roomsCoords = {};
      } else {
        // Always restore map view after any forced-list tab (all/storage/no-floor-plan/requests)
        this.viewMode = 'map';
        document.querySelectorAll('.view-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.view === 'map'));
        document.querySelector('.map-container').classList.remove('hidden');
        document.getElementById('list-container').classList.add('hidden');
      }

      if (!noFloorPlan) {
        const floorPlanEl = document.getElementById('floor-plan');
        if (floorPlanEl && buildingConfig.floorPlan) floorPlanEl.src = buildingConfig.floorPlan;
        await this.waitForFloorPlanImage();
        this.syncFloorPlanDimensionsFromImage(buildingConfig);
        this.rebuildRoomsCoordsFromApi();
        this.map.setRooms(this.roomsCoords);
      }
    }

    // Reset room filter for new building
    this.filters.room = '';
    const roomSelect = document.getElementById('filter-room');
    if (roomSelect) roomSelect.value = '';
    this.updateRoomFilterOptions();

    // Update tab highlight
    document.querySelectorAll('#building-tabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.building === buildingKey);
    });

    // Rerender
    this.applyFilters();
    this.updateStatsHeader();
  }

  /** Toggle between map and list view modes. */
  setupViewToggle() {
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const view = btn.dataset.view;
        if (view === this.viewMode) return;

        if (this.viewMode === 'room') {
          document.getElementById('room-view-container')?.classList.add('hidden');
          this.map.selectedCode = null;
          this.currentSidebarRoomCode = null;
        }

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
    const BUILDING_NAMES = CONFIG.BUILDING_NAMES || {};

    // === STORAGE TAB: render from storageItems ===
    if (isStorage) {
      console.log('[renderListView] Storage mode, storageItems:', this.storageItems.length);

      const theadRowStorage = document.querySelector('#inventory-table thead tr');
      if (theadRowStorage) {
        theadRowStorage.innerHTML = '<th>Название</th><th>Категория</th><th>Кол-во</th><th>Статус</th><th>Фото</th><th>Комментарий</th><th>Обновлено</th>';
      }

      const filteredStorage = this.storageItems.filter(item => {
        if (this.filters.category && item.category_key !== this.filters.category) return false;
        if (this.filters.search) {
          const s = this.filters.search.toLowerCase();
          if (!(item.item_name || '').toLowerCase().includes(s) &&
              !(item.comment || '').toLowerCase().includes(s) &&
              !(item.category_key || '').toLowerCase().includes(s)) return false;
        }
        return true;
      });

      filteredStorage.forEach(item => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.innerHTML = '<strong>' + (item.item_name || '—') + '</strong>';
        tr.appendChild(tdName);

        const tdCat = document.createElement('td');
        const catColor = (CONFIG.CATEGORY_COLORS && CONFIG.CATEGORY_COLORS[item.category_key]) || '#999';
        const catIcon = (CONFIG.CATEGORY_ICONS && CONFIG.CATEGORY_ICONS[item.category_key]) || '';
        tdCat.innerHTML = '<span style="background:' + catColor + ';color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;white-space:nowrap">' +
          catIcon + ' ' + (item.category_key || '—') + '</span>';
        tr.appendChild(tdCat);

        const tdQty = document.createElement('td');
        tdQty.textContent = (item.quantity || 0) + ' ' + (item.unit || 'шт');
        tdQty.style.textAlign = 'center';
        tr.appendChild(tdQty);

        const tdStatus = document.createElement('td');
        const isActive = item.status === 'active';
        tdStatus.innerHTML = '<span style="background:' + (isActive ? '#27AE60' : '#E74C3C') +
          ';color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">' +
          (isActive ? '🟢 В наличии' : '🔴 Нет в наличии') + '</span>';
        tr.appendChild(tdStatus);

        const tdPhoto = document.createElement('td');
        const photoUrls = (item.photos || []).filter(u => u && u.startsWith('http'));
        if (photoUrls.length) {
          const link = document.createElement('span');
          link.className = 'list-photo-link';
          link.textContent = '📷 ' + photoUrls.length;
          link.addEventListener('click', () => this.openLightbox(photoUrls, 0));
          tdPhoto.appendChild(link);
        } else {
          tdPhoto.textContent = '—';
        }
        tr.appendChild(tdPhoto);

        const tdComment = document.createElement('td');
        const comment = item.comment || '—';
        tdComment.textContent = comment.length > 60 ? comment.slice(0, 60) + '…' : comment;
        tdComment.title = comment;
        tr.appendChild(tdComment);

        const tdDate = document.createElement('td');
        tdDate.className = 'list-date';
        if (item.updated_at) {
          try { tdDate.textContent = new Date(item.updated_at).toLocaleDateString('ru-RU'); }
          catch (e) { tdDate.textContent = item.updated_at; }
        } else {
          tdDate.textContent = '—';
        }
        tr.appendChild(tdDate);

        tbody.appendChild(tr);
      });

      const listStatsStorage = document.getElementById('list-stats');
      if (listStatsStorage) {
        listStatsStorage.textContent = 'Склад: ' + filteredStorage.length + ' из ' + this.storageItems.length + ' позиций';
      }

      const chipsElStorage = document.getElementById('category-chips');
      if (chipsElStorage) {
        const catCounts = {};
        this.storageItems.forEach(item => {
          catCounts[item.category_key] = (catCounts[item.category_key] || 0) + 1;
        });

        const activeCat = this.filters.category || '';
        let html = '<button class="chip' + (!activeCat ? ' active' : '') + '" data-cat="">Все (' + this.storageItems.length + ')</button>';
        Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
          const color = (CONFIG.CATEGORY_COLORS && CONFIG.CATEGORY_COLORS[cat]) || '#999';
          const icon = (CONFIG.CATEGORY_ICONS && CONFIG.CATEGORY_ICONS[cat]) || '';
          html += '<button class="chip' + (activeCat === cat ? ' active' : '') +
            '" data-cat="' + cat + '" style="border-color:' + color + ';--chip-color:' + color + '">' +
            icon + ' ' + cat + ' (' + count + ')</button>';
        });
        chipsElStorage.innerHTML = html;
        chipsElStorage.style.display = '';

        chipsElStorage.querySelectorAll('.chip').forEach(btn => {
          btn.addEventListener('click', () => {
            this.filters.category = btn.dataset.cat;
            const catSelect = document.getElementById('filter-category');
            if (catSelect) catSelect.value = this.filters.category;
            this.applyFilters();
          });
        });
      }

      return;
    }

    // Manage "Здание" column header
    const theadRow = document.querySelector('#inventory-table thead tr');
    if (theadRow) {
      const firstHead = theadRow.querySelector('th');
      if (firstHead && firstHead.textContent === 'Название') {
        theadRow.innerHTML = '<th>Комната</th><th>Категория</th><th>Описание</th><th>Состояние</th><th>Кол-во</th><th>Фото</th><th>Дата</th>';
      }
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
      if (!isAll && !this.itemBelongsToBuilding(item)) return false;
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

      // Room: [code] — [name], fallback to name only
      const tdRoom = document.createElement('td');
      const roomLabel = code && roomName ? (code + ' — ' + roomName) : (code || roomName || '—');
      tdRoom.innerHTML = '<strong>' + roomLabel + '</strong>';
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
        link.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openLightbox(listPhotoUrls, 0);
        });
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

      tr.classList.add('list-item-row');
      tr.addEventListener('click', () => {
        const next = tr.nextElementSibling;
        if (next && next.classList.contains('list-item-detail-row')) {
          next.remove();
          tr.classList.remove('expanded');
          return;
        }
        const detailTr = document.createElement('tr');
        detailTr.className = 'list-item-detail-row';
        const detailTd = document.createElement('td');
        detailTd.colSpan = tr.children.length;
        detailTd.appendChild(this.renderItemDetail(item, code));
        detailTr.appendChild(detailTd);
        tr.after(detailTr);
        tr.classList.add('expanded');
      });

      tbody.appendChild(tr);
    });

    const listStats = document.getElementById('list-stats');
    if (listStats) {
      listStats.textContent = isAll
        ? 'Показано: ' + filtered.length + ' предметов в ' + roomsInList.size + ' комнатах (' + buildingsInList.size + ' здания)'
        : 'Показано: ' + filtered.length + ' предметов в ' + roomsInList.size + ' комнатах';
    }

    if (isAll) this.updateStats(filtered.length, roomsInList.size);

    const chipsEl = document.getElementById('category-chips');
    if (chipsEl) {
      chipsEl.style.display = 'none';
      chipsEl.innerHTML = '';
    }
  }

  renderOwnerRequests() {
    const listEl = document.getElementById('requests-cards');
    if (!listEl) return;
    listEl.innerHTML = '';

    const filterVal = document.getElementById('requests-status-filter')
      ? document.getElementById('requests-status-filter').value
      : '';

    const filtered = this.ownerRequests.filter(req => {
      if (filterVal && req.status !== filterVal) return false;
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Нет запросов</div>';
      return;
    }

    filtered.forEach(req => {
      const card = document.createElement('div');
      card.className = 'request-card';
      card.dataset.roomId = String(req.room_id || '');
      card.style.cssText = 'background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:12px;';

      const statusMap = {
        pending:   { color: '#F39C12', label: '⏳ Ожидает' },
        accepted:  { color: '#3498DB', label: '🔄 Принят' },
        completed: { color: '#27AE60', label: '✅ Выполнен' },
        rejected:  { color: '#E74C3C', label: '❌ Отклонён' }
      };
      const st = statusMap[req.status] || { color: '#888', label: req.status || '—' };

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
      header.innerHTML = '<strong style="font-size:14px;">' + (req.request_id || '—') + '</strong>' +
        '<span style="background:' + st.color + ';color:#fff;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:600">' + st.label + '</span>';
      card.appendChild(header);

      if (req.action_type) {
        const typeEl = document.createElement('div');
        typeEl.style.cssText = 'font-size:13px;color:#555;margin-bottom:4px;';
        typeEl.textContent = 'Тип: ' + req.action_type;
        card.appendChild(typeEl);
      }

      const loc = req.location_value || req.location_note || req.building_id || '';
      if (loc) {
        const locEl = document.createElement('div');
        locEl.style.cssText = 'font-size:13px;color:#555;margin-bottom:4px;';
        locEl.textContent = '📍 ' + loc;
        card.appendChild(locEl);
      }

      const reqComment = req.comment || req.description;
      if (reqComment) {
        const commentEl = document.createElement('div');
        commentEl.style.cssText = 'font-size:13px;color:#333;margin-bottom:8px;line-height:1.4;';
        commentEl.textContent = reqComment;
        card.appendChild(commentEl);
      }

      const photoUrls = (req.photos || []).filter(u => u && u.startsWith('http'));
      if (photoUrls.length) {
        const photosEl = document.createElement('div');
        photosEl.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;';
        photoUrls.forEach((url, idx) => {
          const img = document.createElement('img');
          const thumbUrl = this.getDriveThumbnail(url);
          if (thumbUrl) {
            img.src = thumbUrl;
            img.style.cssText = 'width:70px;height:70px;object-fit:cover;border-radius:4px;border:1px solid #ddd;cursor:pointer;';
            img.onclick = () => this.openLightbox(photoUrls, idx);
            photosEl.appendChild(img);
          }
        });
        card.appendChild(photosEl);
      }

      const dateEl = document.createElement('div');
      dateEl.style.cssText = 'font-size:11px;color:#999;text-align:right;';
      if (req.created_at) {
        try { dateEl.textContent = new Date(req.created_at).toLocaleString('ru-RU'); }
        catch (e) { dateEl.textContent = req.created_at; }
      }
      card.appendChild(dateEl);

      listEl.appendChild(card);
    });
  }

  /**
   * Navigate to the Requests tab and highlight request cards for a specific room.
   * Called when user clicks an owner-request badge on a floor plan pin.
   */
  navigateToRequestForRoom(roomCode) {
    const room = this.rooms.find(r => r.code === roomCode);
    const targetRoomId = room ? String(room.id) : '';

    this.switchBuilding('requests');

    setTimeout(() => {
      const reqContainer = document.getElementById('requests-list') || document.getElementById('requests-cards');
      if (!reqContainer) return;

      const cards = reqContainer.querySelectorAll('.request-card');
      let firstMatch = null;

      cards.forEach(card => {
        const cardRoomId = card.dataset.roomId || '';
        if (targetRoomId && cardRoomId === targetRoomId) {
          card.style.outline = '3px solid #e67e22';
          card.style.outlineOffset = '2px';
          card.style.transition = 'outline 0.3s ease';
          if (!firstMatch) firstMatch = card;
        } else {
          card.style.outline = '';
          card.style.outlineOffset = '';
        }
      });

      if (firstMatch) {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  /** Wire up click events for building tab buttons. */
  setupBuildingTabs() {
    const nav = document.getElementById('building-tabs');
    if (!nav) return;
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const key = btn.dataset.building;
      if (key) this.switchBuilding(key);
    });
  
    // Подсветить активный таб при загрузке
    document.querySelectorAll('#building-tabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.building === this.activeBuilding);
    });
  }

  async loadData() {
    this.showLoading();
    window._apiUnavailable = false;

    try {
      const data = await api.getAll();
      this.rooms = data.rooms || [];
      this.items = data.items || [];
      this.storageItems = data.storage_items || [];
      this.ownerRequests = data.owner_requests || [];
      this.repairRequests = data.repair_requests || [];
      this.movementLog = data.movement_log || [];

      this.rooms.forEach(room => {
        this.roomIdToCode[room.id] = room.code;
        this.roomIdToZoneId[room.id] = room.zone_id;
      });

      console.log('[loadData] Loaded:', this.items.length, 'items,', this.storageItems.length, 'storage,',
        this.ownerRequests.length, 'requests,', this.repairRequests.length, 'repairs,',
        this.movementLog.length, 'moves');
    } catch (e) {
      console.error('Data loading error:', e);
      window._apiUnavailable = true;
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
      // Skip items that don't belong to the currently active building tab
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
    if (this.activeBuilding === 'requests') {
      this.renderOwnerRequests();
      return;
    }

    const _activeBuildingConfig = (CONFIG.BUILDINGS || {})[this.activeBuilding] || {};
    const _isStorageTab = CONFIG.STORAGE_BUILDING_IDS &&
      CONFIG.STORAGE_BUILDING_IDS.includes(_activeBuildingConfig.buildingCode);
    const _hasFloorPlan = !(_activeBuildingConfig.hasFloorPlan === false || !_activeBuildingConfig.floorPlan);

    // 'all', storage and no-floor-plan tabs are list-only.
    if (this.activeBuilding === 'all' || _isStorageTab || !_hasFloorPlan) {
      if (this.viewMode === 'list') this.renderListView();
      return;
    }

    const itemsByRoom = this.getItemsByRoom();
    const roomsData = {};
    let totalItems = 0;
    let visibleRooms = 0;

    // Pre-compute rooms with active owner requests for badge display
    const roomsWithActiveRequests = new Set();
    (this.ownerRequests || []).forEach(req => {
      const st = (req.status || '').toLowerCase();
      if (st !== 'pending' && st !== 'in_progress' && st !== 'accepted') return;
      const reqRoomCode = this.roomIdToCode[String(req.room_id)] || '';
      if (reqRoomCode) roomsWithActiveRequests.add(reqRoomCode);
    });

    Object.keys(this.roomsCoords).forEach(code => {
      if (this.filters.room && code !== this.filters.room) {
        const allRoomItemsSkipped = (itemsByRoom[code] || []);
        const hasRepairSkipped = allRoomItemsSkipped.some(item => {
          const rs = (item.repair_status || '').toLowerCase();
          return rs === 'pending' || rs === 'in_progress' || rs === 'assigned' || rs === 'reassigned';
        });
        roomsData[code] = {
          items: [],
          dominantCategory: 'empty',
          hasActiveRepair: hasRepairSkipped,
          hasActiveRequest: roomsWithActiveRequests.has(code),
        };
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

      // Check for active repairs in this room's items (unfiltered — check ALL items, not just filtered)
      const allRoomItems = (itemsByRoom[code] || []);
      const hasActiveRepair = allRoomItems.some(item => {
        const rs = (item.repair_status || '').toLowerCase();
        return rs === 'pending' || rs === 'in_progress' || rs === 'assigned' || rs === 'reassigned';
      });
      const hasActiveRequest = roomsWithActiveRequests.has(code);

      roomsData[code] = {
        items: items,
        dominantCategory: this.getDominantCategory(items),
        hasActiveRepair: hasActiveRepair,
        hasActiveRequest: hasActiveRequest,
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

    if (this.viewMode !== 'room') return;

    const rows = document.querySelectorAll('#room-view-list .room-view-item-row');
    rows.forEach(row => {
      const itemCategory = row.dataset.category || '';
      const itemCondition = row.dataset.condition || '';

      const categoryMatch = !selectedCategory || selectedCategory === '' || itemCategory === selectedCategory;
      const conditionMatch = !selectedCondition || selectedCondition === '' || itemCondition === selectedCondition;
      const visible = categoryMatch && conditionMatch;

      row.style.display = visible ? '' : 'none';
      const next = row.nextElementSibling;
      if (next && next.classList.contains('room-view-item-detail')) {
        next.style.display = visible ? '' : 'none';
      }
    });
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
      if (this.viewMode === 'room') this.filterItems();
    });

    document.getElementById('filter-condition').addEventListener('change', (e) => {
      this.filters.condition = e.target.value;
      this.applyFilters();
      if (this.viewMode === 'room') this.filterItems();
    });

    document.getElementById('filter-search').addEventListener('input', (e) => {
      this.filters.search = e.target.value.trim();
      this.applyFilters();
    });
  }

  setupRoomView() {
    const backBtn = document.getElementById('room-view-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.exitRoomView());
    }
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

  openRoomView(code) {
    this.viewMode = 'room';
    this.currentSidebarRoomCode = code;

    document.querySelector('.map-container')?.classList.add('hidden');
    document.getElementById('list-container')?.classList.add('hidden');
    document.getElementById('requests-container')?.classList.add('hidden');
    document.getElementById('room-view-container')?.classList.remove('hidden');

    this.renderRoomView(code);
  }

  renderRoomView(code) {
    const roomCoords = this.roomsCoords[code] || { name: code };
    const titleEl = document.getElementById('room-view-title');
    if (titleEl) titleEl.textContent = code + ' — ' + roomCoords.name;

    const listEl = document.getElementById('room-view-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const roomItems = this.getItemsByRoom()[code] || [];

    if (roomItems.length === 0) {
      listEl.innerHTML = '<div class="room-view-empty">No items</div>';
      return;
    }

    roomItems.forEach(item => {
      const norm = this.normalizeItemFields(item);
      const row = document.createElement('div');
      row.className = 'room-view-item-row';
      row.dataset.category = norm.category;
      row.dataset.condition = norm.condition || '';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'room-view-item-thumb';
      const photoUrl = this._getFirstItemPhotoUrl(item);
      if (photoUrl) {
        const img = document.createElement('img');
        const thumbSrc = this.getDriveThumbnail(photoUrl);
        if (thumbSrc) img.src = thumbSrc;
        img.alt = '';
        img.onerror = () => {
          img.remove();
          thumbWrap.classList.add('room-view-item-thumb--placeholder');
          if (!thumbWrap.textContent) thumbWrap.textContent = '📷';
        };
        thumbWrap.appendChild(img);
      } else {
        thumbWrap.classList.add('room-view-item-thumb--placeholder');
        thumbWrap.textContent = '📷';
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'room-view-item-name';
      const desc = item.description || 'Без описания';
      nameEl.textContent = desc.length > 120 ? desc.slice(0, 120) + '…' : desc;
      nameEl.title = desc;

      const condEl = document.createElement('span');
      condEl.className = 'room-view-item-condition';
      const condColor = (CONFIG.CONDITION_COLORS && CONFIG.CONDITION_COLORS[norm.condition]) || '#888';
      condEl.style.backgroundColor = condColor;
      condEl.textContent = norm.condition || '—';

      row.appendChild(thumbWrap);
      row.appendChild(nameEl);
      row.appendChild(condEl);

      row.addEventListener('click', () => {
        const next = row.nextElementSibling;
        if (next && next.classList.contains('room-view-item-detail')) {
          next.remove();
          row.classList.remove('expanded');
          return;
        }
        const detailWrap = document.createElement('div');
        detailWrap.className = 'room-view-item-detail';
        detailWrap.appendChild(this.renderItemDetail(item, code));
        row.after(detailWrap);
        row.classList.add('expanded');
      });

      listEl.appendChild(row);
    });

    this.filterItems();
  }

  exitRoomView() {
    document.getElementById('room-view-container')?.classList.add('hidden');
    this.map.selectedCode = null;
    this.currentSidebarRoomCode = null;

    const buildingConfig = this._getBuilding(this.activeBuilding) || {};
    const noFloorPlan = buildingConfig.hasFloorPlan === false || !buildingConfig.floorPlan;
    const isStorage = CONFIG.STORAGE_BUILDING_IDS &&
      CONFIG.STORAGE_BUILDING_IDS.includes(buildingConfig.buildingCode);
    const isAll = this.activeBuilding === 'all';
    const isRequests = this.activeBuilding === 'requests';

    if (isRequests) {
      this.viewMode = 'list';
      document.getElementById('requests-container')?.classList.remove('hidden');
    } else if (isAll || isStorage || noFloorPlan) {
      this.viewMode = 'list';
      document.querySelector('.map-container')?.classList.add('hidden');
      document.getElementById('list-container')?.classList.remove('hidden');
    } else {
      this.viewMode = 'map';
      document.querySelector('.map-container')?.classList.remove('hidden');
      document.getElementById('list-container')?.classList.add('hidden');
    }

    document.querySelectorAll('.view-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.view === this.viewMode));

    this.map.renderPins();
  }

  _getFirstItemPhotoUrl(item) {
    const photos = Array.isArray(item.photos) ? item.photos : [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      let urlStr = typeof p === 'string' ? p : (p && p.url ? p.url : '');
      if (urlStr && urlStr.startsWith('http')) return urlStr;
    }
    const norm = this.normalizeItemFields(item);
    if (norm.nameplate_photo && norm.nameplate_photo.startsWith('http')) {
      return norm.nameplate_photo;
    }
    return null;
  }

  createItemElement(item) {
    const norm = this.normalizeItemFields(item);
    const itemEl = document.createElement('div');
    itemEl.className = 'item item-card';
    itemEl.dataset.category = norm.category;
    itemEl.dataset.condition = norm.condition || '';
    itemEl.dataset.roomCode = item.room_code || '';
    const roomCode = this.currentSidebarRoomCode || item.room_code || '';
    itemEl.appendChild(this.renderItemDetail(item, roomCode));
    return itemEl;
  }

  /** Shared item detail block for sidebar cards and list-view expand rows. */
  renderItemDetail(item, roomCode) {
    const norm = this.normalizeItemFields(item);
    const actualCondition = norm.condition;
    const actualQuantity = parseInt(norm.quantity, 10) || 1;
    const actualCategory = norm.category;
    const resolvedRoomCode = roomCode || item.room_code || '';

    const block = document.createElement('div');
    block.className = 'item-detail-block';

    const metaEl = document.createElement('div');
    metaEl.className = 'item-meta';
    metaEl.style.cssText = 'font-size:12px;color:#888;margin-bottom:8px;line-height:1.5;';
    const itemId = item.id || item.item_id || '';
    const serialModel = norm.serial_model || '—';
    const createdAt = item.created_at ? normalizeTs(item.created_at) : '—';
    metaEl.innerHTML =
      '<div><strong>ID:</strong> ' + (itemId || '—') + '</div>' +
      '<div><strong>Модель / серийный:</strong> ' + serialModel + '</div>' +
      '<div><strong>Создано:</strong> ' + createdAt + '</div>';
    block.appendChild(metaEl);

    const descriptionEl = document.createElement('div');
    descriptionEl.className = 'item-description';
    descriptionEl.style.cssText = 'font-size:14px;color:#333;margin-bottom:8px;line-height:1.4;';
    descriptionEl.textContent = item.description || 'Без описания';
    block.appendChild(descriptionEl);

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
    block.appendChild(categoryBadge);

    const roomCodeEl = document.createElement('div');
    roomCodeEl.className = 'item-room-code';
    roomCodeEl.style.cssText = 'font-size:13px;font-weight:600;color:#888;margin-bottom:4px;';
    roomCodeEl.textContent = resolvedRoomCode || '—';
    block.appendChild(roomCodeEl);

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
    block.appendChild(conditionEl);

    const quantityEl = document.createElement('div');
    quantityEl.className = 'item-quantity';
    quantityEl.style.cssText = 'font-size:13px;color:#666;margin-bottom:8px;';
    quantityEl.innerHTML = '<strong>Qty:</strong> ' + actualQuantity;
    block.appendChild(quantityEl);

    if (norm.repair_status) {
      const repairEl = document.createElement('div');
      repairEl.style.cssText = 'font-size:12px;font-weight:600;margin-top:4px;margin-bottom:6px;';
      const badgeMap = {
        pending:     { icon: '🔧', color: '#F39C12', label: 'Ремонт ожидает' },
        in_progress: { icon: '🔧', color: '#E67E22', label: 'В ремонте' },
        reassigned:  { icon: '🔄', color: '#E67E22', label: 'Переназначена' },
        done:        { icon: '✅', color: '#27AE60', label: 'Ремонт завершён' },
      };
      const b = badgeMap[norm.repair_status] || { icon: '🔧', color: '#F39C12', label: norm.repair_status };
      repairEl.innerHTML = '<span style="background:' + b.color + ';color:#fff;padding:2px 8px;border-radius:4px">' + b.icon + ' ' + b.label + '</span>';
      block.appendChild(repairEl);
    }

    const itemPhotos = document.createElement('div');
    itemPhotos.className = 'item-photos';
    itemPhotos.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;';
    const allPhotoUrls = [];
    const rawPhotos = (item.photos && Array.isArray(item.photos)) ? item.photos : [];
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
    this._appendItemPhotoThumbnails(itemPhotos, allPhotoUrls);
    block.appendChild(itemPhotos);

    block.appendChild(this._renderRepairTimeline(itemId));
    block.appendChild(this._renderMovementTimeline(itemId));

    const actionsEl = document.createElement('div');
    actionsEl.className = 'item-actions';
    actionsEl.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #eee;';

    if (itemId) {
      const moveBtn = document.createElement('a');
      moveBtn.href = BOT_DEEPLINK + 'move_' + encodeURIComponent(itemId);
      moveBtn.target = '_blank';
      moveBtn.className = 'action-btn';
      moveBtn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:6px 12px;background:#3d5a80;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;';
      moveBtn.textContent = '📦 Переместить';
      actionsEl.appendChild(moveBtn);

      const repairBtn = document.createElement('a');
      repairBtn.href = BOT_DEEPLINK + 'repair_' + encodeURIComponent(itemId);
      repairBtn.target = '_blank';
      repairBtn.className = 'action-btn';
      repairBtn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:6px 12px;background:#e67e22;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;';
      repairBtn.textContent = '🔧 Ремонт';
      actionsEl.appendChild(repairBtn);
    }

    if (resolvedRoomCode || this.currentSidebarRoomCode) {
      const reportBtn = document.createElement('a');
      const buildingConfig = this._getBuilding(this.activeBuilding);
      const buildingId = buildingConfig ? buildingConfig.buildingId : 0;
      const rCode = resolvedRoomCode || this.currentSidebarRoomCode;
      const roomObj = this.rooms.find(r => r.code === rCode);
      const roomId = roomObj ? roomObj.id : 0;
      reportBtn.href = BOT_DEEPLINK + 'report_' + buildingId + '_' + roomId;
      reportBtn.target = '_blank';
      reportBtn.className = 'action-btn';
      reportBtn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:6px 12px;background:#c0392b;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;cursor:pointer;';
      reportBtn.textContent = '📸 Сообщить';
      actionsEl.appendChild(reportBtn);
    }

    block.appendChild(actionsEl);
    return block;
  }

  _idTimestampSortKey(id) {
    const m = String(id || '').match(/(\d{8})-(\d{6})/);
    return m ? m[1] + m[2] : '';
  }

  _collectRepairRequestPhotos(req) {
    const urls = [];
    for (let i = 1; i <= 5; i++) {
      const url = req['photo_' + i];
      if (url && String(url).startsWith('http')) urls.push(String(url));
    }
    for (let i = 1; i <= 3; i++) {
      const url = req['completed_photo_' + i];
      if (url && String(url).startsWith('http')) urls.push(String(url));
    }
    return urls;
  }

  _appendItemPhotoThumbnails(container, allPhotoUrls) {
    allPhotoUrls.forEach((urlStr, index) => {
      const img = document.createElement('img');
      const thumbnailUrl = this.getDriveThumbnail(urlStr);
      if (!thumbnailUrl) return;
      img.src = thumbnailUrl;
      img.className = 'item-photo item-thumb';
      img.alt = 'Photo ' + (index + 1);
      img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #ddd;cursor:pointer;transition:opacity 0.2s;';
      img.dataset.photoUrl = urlStr;
      img.onerror = () => { img.style.display = 'none'; };
      img.onclick = (e) => {
        e.stopPropagation();
        this.openLightbox(allPhotoUrls, index);
      };
      container.appendChild(img);
    });
  }

  _renderRepairTimeline(itemId) {
    const section = document.createElement('div');
    section.className = 'item-timeline item-timeline-repairs';
    section.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #eee;';

    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:13px;font-weight:600;color:#555;margin-bottom:6px;';
    heading.textContent = 'История ремонта';
    section.appendChild(heading);

    const requests = (this.repairRequests || [])
      .filter(r => String(r.item_id) === String(itemId))
      .sort((a, b) => {
        const ta = this._idTimestampSortKey(a.request_id) || normalizeTs(a.created_at);
        const tb = this._idTimestampSortKey(b.request_id) || normalizeTs(b.created_at);
        return ta.localeCompare(tb);
      });

    if (!requests.length) {
      const empty = document.createElement('div');
      empty.className = 'timeline-empty';
      empty.style.cssText = 'font-size:12px;color:#aaa;font-style:italic;';
      empty.textContent = 'нет данных';
      section.appendChild(empty);
      return section;
    }

    requests.forEach(req => {
      const row = document.createElement('div');
      row.className = 'timeline-row';
      row.style.cssText = 'font-size:12px;color:#444;margin-bottom:10px;padding:8px;background:#f8f8fc;border-radius:4px;';

      const status = req.status || '—';
      const created = normalizeTs(req.created_at) || '—';
      const desc = req.description || '—';
      const people = (req.reported_by_name || '—') + ' → ' + (req.assigned_to_name || '—');

      let html = '<div><strong>' + status + '</strong> · ' + created + '</div>' +
        '<div style="margin-top:4px">' + desc + '</div>' +
        '<div style="margin-top:4px;color:#666">' + people + '</div>';

      if (req.completion_note || req.completed_at) {
        const note = req.completion_note || '';
        const completed = req.completed_at ? normalizeTs(req.completed_at) : '';
        html += '<div style="margin-top:4px;color:#2e7d32">';
        if (note) html += note;
        if (completed) html += (note ? ' · ' : '') + completed;
        html += '</div>';
      }

      row.innerHTML = html;

      const photoUrls = this._collectRepairRequestPhotos(req);
      if (photoUrls.length) {
        const photosWrap = document.createElement('div');
        photosWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;';
        this._appendItemPhotoThumbnails(photosWrap, photoUrls);
        row.appendChild(photosWrap);
      }

      section.appendChild(row);
    });

    return section;
  }

  _formatMovementLocation(prefix, row) {
    const building = row[prefix + '_building'] || '';
    const zone = row[prefix + '_zone'] || '';
    const room = row[prefix + '_room'] || '';
    const parts = [building, zone, room].filter(p => p !== '' && p != null);
    return parts.length ? parts.join(' / ') : '—';
  }

  _renderMovementTimeline(itemId) {
    const section = document.createElement('div');
    section.className = 'item-timeline item-timeline-moves';
    section.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #eee;';

    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:13px;font-weight:600;color:#555;margin-bottom:6px;';
    heading.textContent = 'История перемещений';
    section.appendChild(heading);

    const moves = (this.movementLog || [])
      .filter(m => String(m.item_id) === String(itemId))
      .sort((a, b) => {
        const ta = this._idTimestampSortKey(a.move_id) || normalizeTs(a.moved_at);
        const tb = this._idTimestampSortKey(b.move_id) || normalizeTs(b.moved_at);
        return ta.localeCompare(tb);
      });

    if (!moves.length) {
      const empty = document.createElement('div');
      empty.className = 'timeline-empty';
      empty.style.cssText = 'font-size:12px;color:#aaa;font-style:italic;';
      empty.textContent = 'нет данных';
      section.appendChild(empty);
      return section;
    }

    moves.forEach(move => {
      const row = document.createElement('div');
      row.className = 'timeline-row';
      row.style.cssText = 'font-size:12px;color:#444;margin-bottom:8px;padding:8px;background:#f8f8fc;border-radius:4px;';

      const fromLoc = this._formatMovementLocation('from', move);
      const toLoc = this._formatMovementLocation('to', move);
      const movedBy = move.moved_by_name || '—';
      const movedAt = normalizeTs(move.moved_at) || '—';
      const reason = move.reason || '—';

      row.innerHTML =
        '<div><strong>' + fromLoc + '</strong> → <strong>' + toLoc + '</strong></div>' +
        '<div style="margin-top:4px;color:#666">' + movedBy + ' · ' + movedAt + '</div>' +
        (reason !== '—' ? '<div style="margin-top:4px">' + reason + '</div>' : '');

      section.appendChild(row);
    });

    return section;
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

  updateStatsHeader() {
    const header = document.getElementById('stats-header');
    if (!header) return;

    const activeKey = this.activeBuilding;

    // Hide for special tabs
    if (activeKey === 'requests' || activeKey === 'str') {
      header.style.display = 'none';
      return;
    }

    header.style.display = '';
    const isAll = activeKey === 'all';

    // Count items for this building
    let buildingItems;
    if (isAll) {
      buildingItems = this.items || [];
    } else {
      buildingItems = (this.items || []).filter(item => this.itemBelongsToBuilding(item));
    }

    // Count rooms that have items
    const roomCodes = new Set();
    buildingItems.forEach(item => {
      const code = item.room_code || this.roomIdToCode[item.room_id] || '';
      if (code) roomCodes.add(code);
    });

    // Count active repairs
    const repairs = buildingItems.filter(item => {
      const rs = (item.repair_status || '').toLowerCase();
      return rs === 'pending' || rs === 'in_progress' || rs === 'assigned' || rs === 'reassigned';
    }).length;

    // Count active owner requests for this building
    let activeRequests;
    if (isAll) {
      activeRequests = (this.ownerRequests || []).filter(req => {
        const st = (req.status || '').toLowerCase();
        return st === 'pending' || st === 'in_progress' || st === 'accepted';
      });
    } else {
      const building = this._getBuilding(activeKey);
      const buildingId = building ? building.buildingId : null;
      activeRequests = (this.ownerRequests || []).filter(req => {
        const st = (req.status || '').toLowerCase();
        if (st !== 'pending' && st !== 'in_progress' && st !== 'accepted') return false;
        if (buildingId === null) return true;
        const reqBid = parseInt(req.building_id, 10);
        return !isNaN(reqBid) && reqBid === buildingId;
      });
    }

    // Update DOM
    const setValue = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setValue('stat-total-items', buildingItems.length);
    setValue('stat-total-rooms', roomCodes.size);
    setValue('stat-repairs', repairs);
    setValue('stat-requests', activeRequests.length);

    // Dim zeros
    ['stat-items-wrap', 'stat-rooms-wrap', 'stat-repairs-wrap', 'stat-requests-wrap'].forEach(id => {
      const wrap = document.getElementById(id);
      if (!wrap) return;
      const val = wrap.querySelector('.stat-value');
      if (val && val.textContent === '0') {
        wrap.classList.add('stat-zero');
      } else {
        wrap.classList.remove('stat-zero');
      }
    });
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
  window.app = app;
});
