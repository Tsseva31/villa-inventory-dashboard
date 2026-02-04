// api.js — Requests to Apps Script Web App + mock data fallback

const MOCK_DATA = {
  rooms: [
    { id: 1, zone_id: 1, name: 'Bar', code: 'MC131' },
    { id: 2, zone_id: 1, name: 'Grand Dining', code: 'MC132' },
    { id: 3, zone_id: 1, name: 'Grand Living', code: 'MC133' },
    { id: 4, zone_id: 1, name: 'Sunken Lounge', code: 'MC134' },
    { id: 5, zone_id: 1, name: 'Grand Colonade', code: 'MC130' },
    { id: 6, zone_id: 1, name: 'Asian Kitchen', code: 'MC129' },
    { id: 7, zone_id: 1, name: 'Owner Kitchen', code: 'MC121' },
    { id: 8, zone_id: 1, name: 'Wine Cellar', code: 'MC119' },
    { id: 9, zone_id: 1, name: 'Powder Room', code: 'MC117' },
    { id: 10, zone_id: 1, name: 'Linen Store', code: 'MC127' },
    { id: 11, zone_id: 1, name: 'Walk In Fridge', code: 'MC126' },
    { id: 12, zone_id: 1, name: 'Entry', code: 'MC124' },
    { id: 13, zone_id: 1, name: 'Store', code: 'MC120A' },
    { id: 14, zone_id: 1, name: 'Exterior Lounge', code: 'MC135' },
    { id: 15, zone_id: 1, name: 'Grand Lobby', code: 'MC116' },
    { id: 16, zone_id: 1, name: 'Reading', code: 'MC138' },
    { id: 17, zone_id: 1, name: 'Library', code: 'MC137' },
    { id: 18, zone_id: 1, name: 'Office', code: 'MC139' },
    { id: 19, zone_id: 1, name: 'Grand Colonnade R', code: 'MC112' },
    { id: 20, zone_id: 1, name: 'Powder Room R', code: 'MC115' },
    { id: 21, zone_id: 1, name: 'Hollywood Movie Theatre', code: 'MC113' },
    { id: 22, zone_id: 1, name: 'Walk In Freezer', code: 'MC125' },
    { id: 23, zone_id: 1, name: 'Toilet', code: 'MC123' },
    { id: 24, zone_id: 1, name: 'Refuse', code: 'MC120' }
  ],
  items: [
    { id: 'INV-MOCK-001', room_id: 1, category: 'furniture', description: 'Bar counter marble top', condition: 'Отличное', quantity: 1, photos: [] },
    { id: 'INV-MOCK-002', room_id: 2, category: 'furniture', description: 'Dining table 20 seats', condition: 'Отличное', quantity: 1, photos: [] },
    { id: 'INV-MOCK-003', room_id: 2, category: 'chandelier', description: 'Crystal chandelier main', condition: 'Отличное', quantity: 1, photos: [] },
    { id: 'INV-MOCK-004', room_id: 3, category: 'furniture', description: 'Sofa set Italian leather', condition: 'Удовлетворительное', quantity: 2, photos: [] },
    { id: 'INV-MOCK-005', room_id: 3, category: 'art', description: 'Oil painting landscape', condition: 'Отличное', quantity: 3, photos: [] },
    { id: 'INV-MOCK-006', room_id: 8, category: 'other', description: 'Wine rack 200 bottles', condition: 'Отличное', quantity: 1, photos: [] },
    { id: 'INV-MOCK-007', room_id: 17, category: 'furniture', description: 'Antique bookshelf oak', condition: 'Отличное', quantity: 4, photos: [] },
    { id: 'INV-MOCK-008', room_id: 21, category: 'tech', description: 'Sony 4K laser projector', condition: 'Отличное', quantity: 1, photos: [] },
    { id: 'INV-MOCK-009', room_id: 21, category: 'furniture', description: 'Cinema seats row', condition: 'Отличное', quantity: 12, photos: [] }
  ]
};

class API {
  constructor() {
    this.baseUrl = CONFIG.API_URL;
  }

  async request(action) {
    const url = this.baseUrl
      ? this.baseUrl + '?action=' + action + '&nocache=' + Date.now()
      : null;

    if (!url) {
      console.warn('API_URL not set, using mock data');
      return this.getMockData(action);
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      // Проверка успешности ответа
      if (data.error) {
        console.error('API returned error:', data.error);
        return this.getMockData(action);
      }

      // D2.3: диагностика фото — для каждого item логируем поля с фото
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item) => {
          const photoField = item.photos !== undefined ? item.photos : item.photo_1;
          const type = typeof photoField;
          const len = type === 'string' ? photoField.length : (Array.isArray(photoField) ? photoField.length : '—');
          console.log('[Photo debug] item.id:', item.id, '| photos/photo_1:', photoField, '| typeof:', type, '| length:', len);
        });
      }

      return data;
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
