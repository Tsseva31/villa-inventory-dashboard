// api.js — Requests to Apps Script Web App + mock data fallback

/** Extract YYYY-MM-DD HH:MM:SS from mixed timestamp strings; no Date parsing. */
function normalizeTs(s) {
  if (s == null || s === '') return '';
  const str = String(s);
  const m = str.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})/);
  if (m) return m[1] + ' ' + m[2];
  return str;
}

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

    const rawStorage = data.storage_items != null ? data.storage_items : data.storageItems;
    const storage_items = Array.isArray(rawStorage)
      ? rawStorage
      : (rawStorage && Array.isArray(rawStorage.storage_items) ? rawStorage.storage_items : []);

    const rawOwner = data.owner_requests != null ? data.owner_requests : data.ownerRequests;
    const owner_requests = Array.isArray(rawOwner)
      ? rawOwner
      : (rawOwner && Array.isArray(rawOwner.requests) ? rawOwner.requests : []);

    return {
      buildings: data.buildings || [],
      rooms: data.rooms || [],
      items: data.items || [],
      storage_items: storage_items,
      owner_requests: owner_requests,
      repair_requests: data.repair_requests || [],
      movement_log: data.movement_log || []
    };
  }

  async changeItemStatus(itemId, newStatus, code) {
    if (!this.baseUrl) {
      return { ok: false, reason: 'network' };
    }
    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        body: JSON.stringify({
          action: 'dashboardChangeStatus',
          code: code,
          item_id: itemId,
          new_status: newStatus
        })
      });
      return await res.json();
    } catch (e) {
      console.error('changeItemStatus error:', e);
      return { ok: false, reason: 'network' };
    }
  }
}

const api = new API();
