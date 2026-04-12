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

  async getAll() {
    const url = this.baseUrl
      ? this.baseUrl + '?action=getAll&nocache=' + Date.now()
      : null;
    if (!url) throw new Error('API_URL not set');
    const response = await fetch(url);
    if (!response.ok) throw new Error('API error: ' + response.status);
    const data = await response.json();
    if (data.error) throw new Error('API error: ' + data.error);
    return {
      buildings: data.buildings || [],
      rooms: data.rooms || [],
      items: data.items || [],
      storage_items: data.storage_items || [],
      owner_requests: data.owner_requests || []
    };
  }
}

const api = new API();
