# Deployment Guide

## Два репозитория — важно понимать
- `villa-inventory-bot` — исходники (правим здесь)
- `villa-inventory-dashboard` — GitHub Pages (только dist)

## Ручной деплой (текущий процесс)
```bash
# 1. Собрать
cd villa-dashboard
npm run build

# 2. Скопировать
xcopy /E /Y dist\* C:\villa-inventory-dashboard\

# 3. Запушить
cd C:\villa-inventory-dashboard
git add .
git commit -m "deploy: описание"
git push

# 4. Подождать 2-3 мин → проверить в инкогнито
```

## Локальная разработка
```bash
cd villa-dashboard
python -m http.server 8080
# http://localhost:8080
```

## Частые ошибки
| Проблема | Причина | Решение |
|----------|---------|---------|
| Сайт не обновился | Не синхронизирован villa-inventory-dashboard | Выполнить ручной деплой |
| Табы не работают локально | Открыт как file:// | Использовать http.server |
| Старая версия в браузере | Кеш | Ctrl+Shift+R или инкогнито |

## TODO
- [ ] Настроить GitHub Actions для автодеплоя
