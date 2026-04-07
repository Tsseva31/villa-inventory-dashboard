/**
 * Google Apps Script for Villa Inventory Dashboard
 * Deploy as Web app: Deploy → New deployment → Web app
 * Execute as: Me, Who has access: Anyone
 *
 * UPDATED: 2026-04-07 — Dynamic header mapping, getBuildings, getAll, new room fields
 */

// ─── doGet — main router ─────────────────────────────────────────────────────
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action || 'getItems';

  var result;
  try {
    switch (action) {
      case 'getItems':      result = getItems();      break;
      case 'getRooms':      result = getRooms();       break;
      case 'getBuildings':  result = getBuildings();   break;
      case 'getAll':        result = getAll();         break;
      default:              result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── getBuildings ─────────────────────────────────────────────────────────────
function getBuildings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Здания');
  if (!sheet) return { success: false, error: 'Sheet "Здания" not found', buildings: [] };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, buildings: [] };

  var headers = data[0];
  function col(name) {
    var idx = headers.indexOf(name);
    if (idx === -1) Logger.log('WARNING: column not found in Здания: ' + name);
    return idx;
  }

  var buildings = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[col('ID')]) continue;

    var active = String(row[col('Активно')] || '').trim().toUpperCase();
    if (active !== 'TRUE' && active !== '1' && active !== 'ИСТИНА') continue;

    buildings.push({
      id:   row[col('ID')],
      name: row[col('Название')] || '',
      code: row[col('Код')] || '',
      active: true
    });
  }

  return { success: true, buildings: buildings };
}

// ─── getRooms ─────────────────────────────────────────────────────────────────
function getRooms() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Комнаты');
  if (!sheet) return { success: false, error: 'Sheet "Комнаты" not found', rooms: [] };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, rooms: [] };

  var headers = data[0];
  function col(name) {
    var idx = headers.indexOf(name);
    if (idx === -1) Logger.log('WARNING: column not found in Комнаты: ' + name);
    return idx;
  }

  var rooms = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[col('ID')]) continue;

    var active = String(row[col('Активно')] || '').trim().toUpperCase();
    if (active !== 'TRUE' && active !== '1' && active !== 'ИСТИНА') continue;

    rooms.push({
      id:         row[col('ID')],
      zone_id:    row[col('Zone_ID')]    || '',
      name:       row[col('Название')]   || '',
      name_th:    row[col('Название_TH')]|| '',
      code:       row[col('Номер')]      || '',
      type:       row[col('Тип')]        || '',
      level:      row[col('Уровень')]    || '',
      sort_order: row[col('Sort_Order')] || 0,
      active:     true,
      plan_id:    row[col('План_ID')]    || '',
      pin_x:      row[col('Pin_X')]      || '',
      pin_y:      row[col('Pin_Y')]      || ''
    });
  }

  // Sort by sort_order ascending
  rooms.sort(function(a, b) {
    return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
  });

  return { success: true, count: rooms.length, rooms: rooms };
}

// ─── getItems ─────────────────────────────────────────────────────────────────
function getItems() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Предметы');
  if (!sheet) return { success: false, error: 'Sheet "Предметы" not found', items: [] };

  var range = sheet.getDataRange();
  var data = range.getValues();
  var formulas = range.getFormulas();
  if (data.length < 2) return { success: true, items: [] };

  var headers = data[0];
  function col(name) {
    var idx = headers.indexOf(name);
    if (idx === -1) Logger.log('WARNING: column not found in Предметы: ' + name);
    return idx;
  }

  var items = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[col('ID')]) continue;

    // Collect photos (Фото_1..Фото_5) — check formulas for HYPERLINK
    var photos = [];
    for (var p = 1; p <= 5; p++) {
      var colIndex = col('Фото_' + p);
      if (colIndex < 0) continue;
      var url = '';
      var formula = formulas[i][colIndex] || '';
      if (formula) {
        var match = String(formula).match(/=HYPERLINK\("([^"]+)"/i);
        if (match) url = match[1];
      }
      if (!url) {
        var val = String(row[colIndex] || '');
        if (val.startsWith('http')) url = val;
      }
      if (url) photos.push(url);
    }

    // Nameplate photo
    var npColIndex = col('Шильд_Фото_URL');
    var nameplatePhoto = '';
    if (npColIndex >= 0) {
      var npFormula = formulas[i][npColIndex] || '';
      var npMatch = String(npFormula).match(/=HYPERLINK\("([^"]+)"/i);
      if (npMatch) nameplatePhoto = npMatch[1];
      if (!nameplatePhoto) {
        var npVal = String(row[npColIndex] || '');
        if (npVal.startsWith('http')) nameplatePhoto = npVal;
      }
    }

    items.push({
      id:              row[col('ID')],
      date:            row[col('Дата_создания')]    || '',
      telegram_id:     row[col('Telegram_ID')]      || '',
      building_id:     row[col('Building_ID')]      || '',
      zone_id:         row[col('Zone_ID')]          || '',
      room_id:         row[col('Room_ID')]          || '',
      room_code:       row[col('Комната_Код')]      || '',
      category:        row[col('Категория')]        || '',
      description:     row[col('Описание')]         || '',
      condition:       row[col('Состояние')]        || '',
      quantity:        row[col('Количество')]       || 1,
      photo_count:     row[col('Фото_кол-во')]      || 0,
      photos:          photos,
      serial_model:    row[col('Серийник_Модель')]   || '',
      nameplate_photo: nameplatePhoto,
      repair_status:   row[col('repair_status')]     || '',
      status:          row[col('Статус')]            || ''
    });
  }

  return { success: true, count: items.length, items: items };
}

// ─── getAll ───────────────────────────────────────────────────────────────────
function getAll() {
  return {
    success: true,
    buildings: getBuildings().buildings,
    rooms: getRooms().rooms,
    items: getItems().items
  };
}

// ─── Test functions ───────────────────────────────────────────────────────────
function testGetBuildings() {
  var result = getBuildings();
  Logger.log('Buildings: ' + JSON.stringify(result));
}

function testGetRooms() {
  var result = getRooms();
  Logger.log('Rooms count: ' + result.count);
  if (result.rooms.length > 0) Logger.log('First room: ' + JSON.stringify(result.rooms[0]));
}

function testGetItems() {
  var result = getItems();
  Logger.log('Items count: ' + result.count);
  if (result.items.length > 0) Logger.log('First item: ' + JSON.stringify(result.items[0]));
}