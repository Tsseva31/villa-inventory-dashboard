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

    this.init();
  }

  async init() {
    const res = await fetch('data/rooms.json');
    this.rooms = await res.json();

    window.addEventListener('resize', () => this.updateScale());

    // Ждём загрузки изображения (в т.ч. из кэша — load не срабатывает)
    await this.waitForImage();

    this.updateScale();

    // ResizeObserver: при первом валидном размере контейнера (и при изменении) — пересчёт SVG
    this.initResizeObserver();

    const debug = new URLSearchParams(location.search).get('debug') === '1';
    if (debug) this.setupDebugClick();
  }

  initResizeObserver() {
    const wrapper = this.container.querySelector('.map-wrapper');
    if (!wrapper) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 100 && height > 100) {
        this.updateScale();
      }
    });
    observer.observe(wrapper);
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
    const wrapper = this.container.querySelector('.map-wrapper');
    const rect = wrapper ? wrapper.getBoundingClientRect() : this.floorPlan.getBoundingClientRect();
    if (typeof console !== 'undefined' && console.log) {
      console.log('[PIN] updateScale:', { clientWidth: wrapper && wrapper.clientWidth, clientHeight: wrapper && wrapper.clientHeight, rect: rect.width + 'x' + rect.height });
    }
    this.scale = rect.width / CONFIG.FLOOR_PLAN_WIDTH;

    // SVG всегда в натуральных координатах плана (1545×763); масштабирование через viewBox
    this.pinsLayer.setAttribute('viewBox', '0 0 ' + CONFIG.FLOOR_PLAN_WIDTH + ' ' + CONFIG.FLOOR_PLAN_HEIGHT);
    this.pinsLayer.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    this.pinsLayer.setAttribute('width', '100%');
    this.pinsLayer.setAttribute('height', '100%');
    this.pinsLayer.style.position = 'absolute';
    this.pinsLayer.style.top = '0';
    this.pinsLayer.style.left = '0';
    this.pinsLayer.style.width = '100%';
    this.pinsLayer.style.height = '100%';

    console.log('[PIN] SVG viewBox: 0 0', CONFIG.FLOOR_PLAN_WIDTH, CONFIG.FLOOR_PLAN_HEIGHT, '| container rect:', rect.width, 'x', rect.height);

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
    console.log('[PIN] 4. map.js renderPins: rooms (pins) count =', roomCodes.length, '| coords in viewBox space (0 0 1545 763)');
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
        this.selectedCode = code;
        this.renderPins();
        this.onPinClick(code);
      });

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
