# Проверка доступа к фото в Google Drive

## 1. Проверка доступности по URL (curl)

Подставьте реальный `FILE_ID` из ссылки (например из `https://drive.google.com/file/d/FILE_ID/view`):

```bash
# Прямой доступ (uc)
curl -I "https://drive.google.com/uc?id=FILE_ID"

# Или thumbnail (как использует дашборд)
curl -I "https://drive.google.com/thumbnail?id=FILE_ID&sz=w400"
```

- **200 OK** — файл доступен по ссылке.
- **302/303** с переходом на `accounts.google.com` или **403** — доступ ограничен, нужно выставить «Anyone with the link».

В Windows PowerShell:

```powershell
curl.exe -I "https://drive.google.com/uc?id=FILE_ID"
```

---

## 2. Права доступа в Google Drive

Чтобы фото открывались в дашборде без входа в аккаунт:

1. Откройте файл (фото) в Google Drive.
2. ПКМ по файлу → **Share** / **Настройки доступа**.
3. В блоке **General access** выберите **Anyone with the link** (или **Anyone with the link can view**).
4. Сохраните.

Проверка: откройте ссылку в режиме инкогнито или с другого браузера без входа в Google — изображение должно открываться.

---

## 3. Данные в Google Sheets

- В ячейках листа «Предметы» (колонки с фото) должны быть **полные ссылки** вида  
  `https://drive.google.com/file/d/XXXXX/view` или  
  `https://drive.google.com/open?id=XXXXX`.
- Не используйте только ID файла без домена — дашборд ожидает URL, из которого извлекается ID.
- Apps Script отдаёт массив `photos` из колонок 13–17; каждая непустая ячейка — один элемент массива (URL строкой).
