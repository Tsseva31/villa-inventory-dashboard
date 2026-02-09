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
 * Column structure (0-indexed): A=0 ID, B=1 Дата, C=2 Telegram_ID, D=3 Building_ID,
 * E=4 Zone_ID, F=5 Room_ID, G=6 Комната_Код, H=7 Категория, I=8 Подкатегория,
 * J=9 Название, K=10 Описание, L=11 Состояние, M=12 Количество, N=13 Фото_кол-во,
 * O-S=14-18 Фото_1-5, T=19 Последнее_обновление, U=20 Статус
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

    // Photos: columns O-S (indices 14-18)
    const photos = [];
    for (let j = 14; j <= 18; j++) {
      if (row[j]) photos.push(row[j]);
    }

    // КРИТИЧНО: L=11 Состояние (текст: "Отличное", "Хорошее" и т.д.), M=12 Количество (число).
    // Не путать индексы 11 и 12 — иначе в карточке Qty покажет состояние!
    items.push({
      id: row[0],              // A: ID
      date: row[1],            // B: Дата_создания
      telegram_id: row[2],     // C: Telegram_ID
      building_id: row[3],     // D: Building_ID
      zone_id: row[4],         // E: Zone_ID
      room_id: row[5],         // F: Room_ID
      room_code: row[6],       // G: Комната_Код (например "MC116")
      category: row[7],        // H: Категория (например "furniture"), НЕ код комнаты!
      description: row[10],    // K: Описание
      condition: row[11],      // L: Состояние (например "Отличное") — НЕ число!
      quantity: row[12] || 1,  // M: Количество (число, например 1) — НЕ состояние!
      photo_count: row[13],    // N: Фото_кол-во
      photos: photos,          // O-S: Фото_1-5
      status: row[20]          // U: Статус
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
