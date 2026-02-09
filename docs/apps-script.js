/**
 * Google Apps Script for Villa Inventory Dashboard
 * Deploy as Web app: Deploy → New deployment → Web app
 * Execute as: Me, Who has access: Anyone
 *
 * UPDATED: 2026-02-09 - Added room_code column support
 */

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || 'getItems';

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

/**
 * Get items from "Предметы" sheet
 * Column structure (22 columns, 0-indexed):
 * 0=ID, 1=Дата, 2=TelegramID, 3=BuildingID, 4=ZoneID, 5=RoomID,
 * 6=Комната_Код, 7=Категория, 8=Подкатегория, 9=Название, 10=Описание,
 * 11=Состояние, 12=Количество, 13=Фото_кол-во, 14-18=Фото_1-5,
 * 19=Последнее_обновление, 20=Статус
 */
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

    // Photos: columns 14-18 (indices 14, 15, 16, 17, 18)
    const photos = [];
    for (let j = 14; j <= 18; j++) {
      if (row[j]) photos.push(row[j]);
    }

    items.push({
      id: row[0],
      date: row[1],
      telegram_id: row[2],
      building_id: row[3],
      zone_id: row[4],
      room_id: row[5],
      room_code: row[6],       // Комната_Код (MC131, MC135...)
      category: row[7],        // Категория
      description: row[10],    // Описание
      condition: row[11],      // Состояние
      quantity: row[12] || 1,  // Количество
      photo_count: row[13],    // Фото_кол-во
      photos: photos,          // Фото_1 - Фото_5
      status: row[20]          // Статус
    });
  }

  return { success: true, count: items.length, items: items };
}

/**
 * Get rooms from "Комнаты" sheet
 * Column structure: 0=ID, 1=Zone_ID, 2=Название, 3=Номер(code),
 * 4=Этаж, 5=Тип, 6=Активно, 7=Площадь_м²
 */
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
      code: row[3],      // Номер (MC131, MC132...)
      floor: row[4],
      type: row[5],
      area: row[7]
    });
  }

  return { success: true, count: rooms.length, rooms: rooms };
}

// === Test functions ===

function testGetItems() {
  const result = getItems();
  Logger.log('Items count: ' + (result.items ? result.items.length : 0));
  if (result.items && result.items.length > 0) {
    Logger.log('First item: ' + JSON.stringify(result.items[0], null, 2));
  }
}

function testGetRooms() {
  const result = getRooms();
  Logger.log('Rooms count: ' + (result.rooms ? result.rooms.length : 0));
}
