// api.js — Requests to Apps Script Web App + mock data fallback

const MOCK_DATA = {
  rooms: [],
  items: [],
  buildings: []
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
        window._apiUnavailable = true;
        return this.getMockData(action);
      }

      window._apiUnavailable = false;

      return data;
    } catch (e) {
      console.error('API error:', e);
      console.warn('Falling back to mock data');
      window._apiUnavailable = true;
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
