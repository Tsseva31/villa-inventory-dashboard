// map.js — Floor plan rendering and pins (SVG overlay)

class FloorMap {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.pinsLayer = document.getElementById('pins-layer');
    this.floorPlan = document.getElementById('floor-plan');
    this.tooltip = document.getElementById('tooltip');

    this.rooms = {};
    this.roomsData = {};
    this.selectedCode = null;
    this.scale = 1;

    // Floor plan dimensions — set via setFloorPlanDimensions(); fall back to CONFIG
    this.floorPlanWidth = null;
    this.floorPlanHeight = null;

    this.init();
  }

  async init() {
    // rooms are now loaded and pushed by App via setRooms() — no fetch here
    window.addEventListener('resize', () => this.updateScale());

    await this.waitForImage();

    this.updateScale();

    this.initResizeObserver();

    const debug = new URLSearchParams(location.search).get('debug') === '1';
    if (debug) this.setupDebugClick();
  }

  /** Called by App when switching buildings. Replaces room coords and redraws. */
  setRooms(rooms) {
    this.rooms = rooms || {};
    this.selectedCode = null;
    this.updateScale();
  }

  /** Called by App when switching buildings. Updates viewBox dimensions. */
  setFloorPlanDimensions(width, height) {
    this.floorPlanWidth = width || null;
    this.floorPlanHeight = height || null;
    this.updateScale();
  }

  initResizeObserver() {
    if (!this.container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 100 && height > 100) {
        this.updateScale();
      }
    });
    observer.observe(this.container);
    this.resizeObserver = observer;
  }

  waitForImage() {
    return new Promise((resolve) => {
      if (this.floorPlan.complete && this.floorPlan.naturalWidth > 0) {
        resolve();
      } else {
        this.floorPlan.addEventListener('load', resolve, { once: true });
        this.floorPlan.addEventListener('error', resolve, { once: true });
      }
    });
  }

  setupDebugClick() {
    this.container.addEventListener('click', (e) => {
      const rect = this.floorPlan.getBoundingClientRect();
      const xDisplay = e.clientX - rect.left;
      const yDisplay = e.clientY - rect.top;
      if (xDisplay < 0 || yDisplay < 0 || xDisplay > rect.width || yDisplay > rect.height) return;
      const xNatural = Math.round(xDisplay / this.scale);
      const yNatural = Math.round(yDisplay / this.scale);
      console.log('Click coords (image):', xNatural, yNatural);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', xNatural);
      circle.setAttribute('cy', yNatural);
      circle.setAttribute('r', 5);
      circle.setAttribute('fill', 'red');
      this.pinsLayer.appendChild(circle);
    });
  }

  updateScale() {
    const fallbackW = this.floorPlan && this.floorPlan.naturalWidth ? this.floorPlan.naturalWidth : null;
    const fallbackH = this.floorPlan && this.floorPlan.naturalHeight ? this.floorPlan.naturalHeight : null;
    const planW = this.floorPlanWidth || CONFIG.FLOOR_PLAN_WIDTH || fallbackW || 1;
    const planH = this.floorPlanHeight || CONFIG.FLOOR_PLAN_HEIGHT || fallbackH || 1;

    const wrapper = this.container.querySelector('.map-wrapper');
    if (!wrapper || !this.container) return;

    const cs = getComputedStyle(this.container);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const cw = Math.max(1, this.container.clientWidth - padX);
    const ch = Math.max(1, this.container.clientHeight - padY);

    const isMobile =
      typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
    // Desktop: fit both dimensions (sidebar-aware width, header/tabs/footer-aware height).
    // Mobile: fill horizontal space; allow vertical scroll when plan is tall.
    let scaleFit = 1;
    if (planW > 0 && planH > 0) {
      scaleFit = isMobile ? cw / planW : Math.min(cw / planW, ch / planH);
    }

    const displayW = Math.max(1, planW * scaleFit);
    const displayH = Math.max(1, planH * scaleFit);

    wrapper.style.maxWidth = '100%';
    wrapper.style.width = displayW + 'px';
    wrapper.style.height = displayH + 'px';
    wrapper.style.aspectRatio = planW + ' / ' + planH;

    const rect = wrapper.getBoundingClientRect();
    if (typeof console !== 'undefined' && console.log) {
      console.log('[PIN] updateScale:', {
        avail: cw + 'x' + ch,
        display: displayW + 'x' + displayH,
        rect: rect.width + 'x' + rect.height,
        isMobile,
      });
    }
    this.scale = rect.width / planW;

    // SVG always in natural floor-plan coords; scaling via viewBox
    this.pinsLayer.setAttribute('viewBox', '0 0 ' + planW + ' ' + planH);
    this.pinsLayer.setAttribute('preserveAspectRatio', 'none');
    this.pinsLayer.setAttribute('width', '100%');
    this.pinsLayer.setAttribute('height', '100%');
    this.pinsLayer.style.position = 'absolute';
    this.pinsLayer.style.top = '0';
    this.pinsLayer.style.left = '0';
    this.pinsLayer.style.width = '100%';
    this.pinsLayer.style.height = '100%';

    console.log('[PIN] SVG viewBox: 0 0', planW, planH, '| container rect:', rect.width, 'x', rect.height);

    this.renderPins();
  }

  setData(roomsData) {
    this.roomsData = roomsData || {};
    this.renderPins();
  }

  renderPins() {
    this.pinsLayer.innerHTML = '';

    const xOffset = CONFIG.COORD_X_OFFSET || 0;
    const yOffset = CONFIG.COORD_Y_OFFSET || 0;
    const xScale = CONFIG.COORD_X_SCALE || 1.0;
    const yScale = CONFIG.COORD_Y_SCALE || 1.0;

    const roomCodes = Object.keys(this.rooms);
    console.log('[PIN] 4. map.js renderPins: rooms (pins) count =', roomCodes.length, '| coords in viewBox space (0 0 ' + (this.floorPlanWidth || CONFIG.FLOOR_PLAN_WIDTH) + ' ' + (this.floorPlanHeight || CONFIG.FLOOR_PLAN_HEIGHT) + ')');
    console.log('[PIN] Calibration: xOffset=' + xOffset, 'yOffset=' + yOffset, 'xScale=' + xScale, 'yScale=' + yScale);

    Object.entries(this.rooms).forEach(([code, coords]) => {
      const data = this.roomsData[code] || { items: [], dominantCategory: 'empty' };
      const hasItems = (data.items && data.items.length > 0);
      const isSelected = (code === this.selectedCode);
      const color = isSelected
        ? (CONFIG.PIN_COLORS && CONFIG.PIN_COLORS.selected) || '#2196F3'
        : hasItems
          ? (CONFIG.PIN_COLORS && CONFIG.PIN_COLORS.hasItems) || '#4CAF50'
          : (CONFIG.PIN_COLORS && CONFIG.PIN_COLORS.empty) || '#9E9E9E';
      const isEmpty = !hasItems;

      // Координаты в пространстве viewBox (натуральный план 1545×763); масштаб через viewBox
      const x = (coords.x * xScale) + xOffset;
      const y = (coords.y * yScale) + yOffset;

      console.log('[PIN] Room "' + code + '" → rooms.json x:' + coords.x + ', y:' + coords.y + ' → viewBox x:' + Math.round(x) + ', y:' + Math.round(y) + ' | items:' + (data.items ? data.items.length : 0));

      const baseRadius = CONFIG.PIN_SIZE / 2;

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', baseRadius);
      circle.setAttribute('fill', color);
      circle.setAttribute('stroke', isEmpty ? '#999' : '#fff');
      circle.setAttribute('stroke-width', isEmpty ? '1.5' : '2');
      circle.setAttribute('data-code', code);
      circle.setAttribute('data-base-r', baseRadius);
      circle.classList.add('pin');
      if (isSelected) circle.classList.add('selected');
      if (isEmpty) circle.classList.add('empty');

      // Добавить фильтр для тени (лучшая видимость на белом фоне)
      circle.style.filter = 'drop-shadow(1px 1px 2px rgba(0,0,0,0.3))';

      // Hover эффект через изменение радиуса (без transform!)
      circle.addEventListener('mouseenter', (e) => {
        circle.setAttribute('r', baseRadius * 1.3);
        this.showTooltip(e, code, coords.name);
      });

      circle.addEventListener('mouseleave', () => {
        circle.setAttribute('r', baseRadius);
        this.hideTooltip();
      });

      circle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handlePinClick(code);
      });

      this.pinsLayer.appendChild(circle);

      // Badge: small red dot for active repairs/requests
      const hasRepair = data.hasActiveRepair || false;
      const hasRequest = data.hasActiveRequest || false;
      if (hasRepair || hasRequest) {
        const badgeR = Math.max(4, baseRadius * 0.4);
        const badgeX = x + baseRadius * 0.7;
        const badgeY = y - baseRadius * 0.7;
        const badgeColor = hasRepair ? '#e74c3c' : '#e67e22';

        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        badge.setAttribute('cx', badgeX);
        badge.setAttribute('cy', badgeY);
        badge.setAttribute('r', badgeR);
        badge.setAttribute('fill', badgeColor);
        badge.setAttribute('stroke', '#fff');
        badge.setAttribute('stroke-width', '1.5');
        badge.classList.add('pin-badge');
        badge.style.pointerEvents = 'none';

        this.pinsLayer.appendChild(badge);
      }
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

  handlePinClick(roomCode) {
    console.log('[Map] Pin clicked:', roomCode, '| previous selected:', this.selectedCode);
    this.selectedCode = roomCode;
    // Open sidebar first, then re-render pins so selected state is visible
    if (this.onRoomSelect) {
      this.onRoomSelect(roomCode);
    }
    this.renderPins();
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
