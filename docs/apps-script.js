/**
 * Google Apps Script for Villa Inventory Dashboard
 * Paste this into your Google Sheet: Extensions → Apps Script
 * Deploy as Web app: Deploy → New deployment → Web app
 * Execute as: Me, Who has access: Anyone
 * Copy the Web app URL into js/config.js → API_URL (or set window.VILLA_API_URL)
 */

function doGet(e) {
  const action = e.parameter.action || 'getItems';

  let result;
  switch (action) {
    case 'getItems':
      result = getItems();
      break;
    case 'getRooms':
      result = getRooms();
      break;
    case 'getAll':
      result = {
        success: true,
        rooms: getRooms().rooms,
        items: getItems().items
      };
      break;
    default:
      result = { error: 'Unknown action' };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getItems() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Предметы');

  if (!sheet) return { success: false, error: 'Sheet "Предметы" not found', items: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, items: [] };

  const items = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;

    const photos = [];
    for (let j = 13; j <= 17; j++) {
      if (row[j]) photos.push(row[j]);
    }

    items.push({
      id: row[0],
      date: row[1],
      telegram_id: row[2],
      building_id: row[3],
      zone_id: row[4],
      room_id: row[5],
      category: row[6],
      description: row[9],
      condition: row[10],
      quantity: row[11] || 1,
      photo_count: row[12],
      photos: photos,
      status: row[19]
    });
  }

  return { success: true, count: items.length, items: items };
}

function getRooms() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Комнаты');

  if (!sheet) return { success: false, error: 'Sheet "Комнаты" not found', rooms: [] };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, rooms: [] };

  const rooms = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;

    const active = String(row[6]).toUpperCase();
    if (active !== 'TRUE' && active !== '1') continue;

    rooms.push({
      id: row[0],
      zone_id: row[1],
      name: row[2],
      code: row[3],
      floor: row[4],
      type: row[5],
      area: row[7]
    });
  }

  return { success: true, count: rooms.length, rooms: rooms };
}
