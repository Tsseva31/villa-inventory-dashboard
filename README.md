# Villa Inventory Dashboard

Interactive floor plan visualization of villa inventory. Read-only dashboard: data from Google Sheets via Apps Script Web App.

## Quick Start

1. **Without API (mock data)**  
   - Run a local static server from this folder, e.g. `npx serve .` or `npm start` (uses Express).  
   - Or open `index.html` in a browser (some browsers may block `fetch` to `data/rooms.json` on `file://`).

2. **With Google Sheets**  
   - Deploy the Apps Script from `docs/apps-script.js` (see below).  
   - Set the Web app URL in `js/config.js` as `API_URL`, or set `window.VILLA_API_URL` before the app loads.

## Google Apps Script Setup

1. Open your Google Sheet (with sheets "Комнаты" and "Предметы").
2. Go to **Extensions → Apps Script**.
3. Paste the code from `docs/apps-script.js`.
4. **Deploy → New deployment → Web app**.
5. **Execute as:** Me · **Who has access:** Anyone.
6. Copy the Web app URL and set it in `js/config.js` as `API_URL`, or pass it as `window.VILLA_API_URL` when embedding.

## Data Mapping

- **"Комнаты"** sheet: column **Номер** (index 3) = room code (MC131, MC132, …). This is the key used in `data/rooms.json` and for pins on the map.
- **"Предметы"** sheet: **Room_ID** (column 5) links to **ID** in "Комнаты". The dashboard maps Room_ID → Комнаты.ID → Комнаты.Номер (code) → `rooms.json` key.

## Deploy to GitHub Pages

1. **Сборка:** в папке `villa-dashboard` выполните:
   ```bash
   npm run build
   ```
   Появится папка `dist/` с готовым статическим сайтом (все пути относительные, в корне лежит `.nojekyll`).

2. **Вариант A — деплой из корня репозитория (сайт в подпапке):**
   - Если репозиторий называется `villa-inventory-bot` и в нём лежит папка `villa-dashboard`, то для выдачи именно дашборда нужно либо:
     - использовать **GitHub Actions**: workflow копирует содержимое `villa-dashboard/dist/` в ветку `gh-pages`, и в **Settings → Pages** указать **Source: Deploy from a branch**, Branch: `gh-pages`, Folder: `/ (root)`; либо
     - завести отдельный репозиторий только для дашборда и пушить туда содержимое `villa-dashboard/dist/` в ветку `main` (или `gh-pages`).

3. **Вариант B — отдельный репозиторий только для дашборда:**
   - Создайте репозиторий, например `villa-dashboard`.
   - После `npm run build` скопируйте **содержимое** папки `dist/` в корень репозитория (или настройте ветку `gh-pages` и пушите туда содержимое `dist/`).
   - **GitHub → Settings → Pages → Source:** branch `main` (или `gh-pages`), folder **/ (root)** → Save.
   - Сайт будет доступен по адресу `https://<username>.github.io/villa-dashboard/`.

4. **Важно:** В проекте все пути к CSS, JS, `data/rooms.json` и `assets/` уже относительные — подпути и ассеты на GitHub Pages работают без 404. Файл `.nojekyll` отключает Jekyll, чтобы не ломались каталоги с `_` и имена файлов.

5. **API:** URL Google Apps Script задаётся в `js/config.js` (`API_URL`) или через `window.VILLA_API_URL` — используйте полный абсолютный URL (например `https://script.google.com/macros/s/.../exec`).

## Deploy to Railway

1. Push this folder (or repo) to GitHub.
2. In Railway: **New Project → Deploy from GitHub** and select the repo (or path to `villa-dashboard`).
3. Railway will detect Node.js and run `npm start`.
4. Optionally set `VILLA_API_URL` in Railway environment and expose it to the client (e.g. via a small inline script in `index.html` that sets `window.VILLA_API_URL` from the env).

## Local Development

```bash
npm install
npm start
```

Then open http://localhost:3000 (or the port shown).  
For static-only: `npx serve .` and open the URL given.

## Structure

- `index.html` — main page (header, map, sidebar, footer, photo modal).
- `css/styles.css` — layout and styles.
- `js/config.js` — API URL, floor plan size, category/condition colors and icons.
- `js/api.js` — fetch from Apps Script or mock data.
- `js/map.js` — floor plan + SVG pins from `data/rooms.json`.
- `js/app.js` — init, filters, sidebar, legend, stats.
- `data/rooms.json` — room codes and coordinates for pins.
- `assets/floor-plan-mc.png` — floor plan image.
- `docs/apps-script.js` — Apps Script code for documentation/copy-paste.

## Acceptance Criteria (from TASK_DASHBOARD)

- Floor plan displayed; 24 pins from `rooms.json`; pin color = dominant category.
- Tooltip on pin hover; click on pin opens sidebar with room items.
- Category, condition, and search filters work; stats and legend update.
- Item photos open in modal; layout is responsive; works with mock data when API is not set.
