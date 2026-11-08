# adaparse

Парсер, который сам пытается ожить, когда сайт поменял вёрстку.

Обычный скрипт цепляется за CSS-классы. Классы переименовали — и всё, тишина.  
`adaparse` смотрит на смысл: цены, названия, карточки, JSON-LD и т.п. Правила кэширует, а если качество упало — чинит себя в рамках лимитов и только потом сохраняет новую версию.

Ставится у тебя. Интерфейса нет. Нейросеть **не нужна** (есть опциональный плагин, по умолчанию выключен).

---

## Быстрый старт

```bash
npm install
npm test
npm run adaparse -- run -c fixtures/configs/demo-mock-site.yaml
```

Если ок — в терминале JSON с товарами. Демо-страницы лежат в `fixtures/`, живой интернет для первого прогона не нужен.

Другие демо:

```bash
npm run adaparse -- run -c fixtures/configs/demo-product-list.yaml
npm run adaparse -- run -c fixtures/configs/demo-article-list.yaml
npm run eval
```

---

## Что умеет

- Доставать товары, статьи, наличие «в наличии / нет», свои поля (`custom`)
- Листать каталог (`rel=next` и похожие ссылки)
- Несколько стартовых URL сразу, потом склеить и убрать дубли
- Следить по таймеру (`watch`) и дернуть webhook, если данные уехали или парсинг упал
- Экспорт/импорт правил (`rule export|import`) — без тихой перезаписи, всегда новая версия
- Офлайн-проверку точности (`eval`)
- HTTP «из коробки»; браузер (Playwright) — по желанию
- Куки / заголовки / storageState, если страница за логином (это не обход капчи)

---

## Минимальный конфиг

```yaml
site: my-shop
entry: https://example.com/catalog
target:
  preset: product_list   # product_detail | price_only | availability | article_list | custom
heal:
  enabled: true
  canary: balanced
output:
  format: json
  path: ./out/result.json
```

Полный пример крутилок — ниже в английской части и в `fixtures/configs/`.

---

## Команды

```
adaparse init
adaparse run -c config.yaml
adaparse doctor -c config.yaml
adaparse heal -c config.yaml
adaparse snapshot show|diff -c config.yaml
adaparse watch -c config.yaml --interval 300 [--once]
adaparse rule export -c config.yaml -o pack.json
adaparse rule import -c config.yaml -i pack.json
adaparse eval -d fixtures/eval
adaparse metrics -c config.yaml
adaparse version
```

---

## Где это лежит у тебя

Папка проекта:

`D:\Работа\Скрипты\sup-pars`

Исходники — `src/`, демо HTML — `fixtures/`, тесты — `tests/`.

---

## Честно про ограничения

Не жди чудес на сайтах с жёсткой капчей и antibot. Прокси-пула и красивой админки нет.  
Идея проекта другая: стабильный self-host сбор данных без обязательного ИИ.

Уважай robots.txt, ToS и законы. Лимиты в конфиге как раз чтобы не долбить чужой сервер.

---

## License

MIT

---

# adaparse (English)

A scraper that tries to fix itself when a site redesigns.

Most scrapers die when CSS class names change. adaparse looks for signals instead: money, titles, card grids, JSON-LD, and similar. It caches a rule genome, and if quality drops it heals inside budgets, then canary-checks before saving a new version.

Self-host. No UI. No required LLM (optional plugin exists; off by default).

## Quick start

```bash
npm install
npm test
npm run adaparse -- run -c fixtures/configs/demo-mock-site.yaml
```

You should get JSON items in the terminal. Demo pages live under `fixtures/` so the first run works offline.

```bash
npm run adaparse -- run -c fixtures/configs/demo-product-list.yaml
npm run adaparse -- run -c fixtures/configs/demo-article-list.yaml
npm run eval
```

## What it does

- Products, articles, stock, or custom typed fields
- Pagination via `rel=next`-style links
- Multi-entry URLs, merge + dedupe
- `watch` loop with webhook on drift / heal / fail
- Versioned rule pack export/import (import always adds a new version)
- Offline eval scoreboard
- HTTP by default; optional Playwright for JS-heavy pages (network sniff, scroll, load-more)
- Session cookies / headers / storageState (not an antibot bypass)

## Config sketch

```yaml
site: example
entry: https://example.com/catalog   # or a list of URLs
target:
  preset: product_list
fetch:
  mode: http          # or browser
  respect_robots: true
  cache: true
  browser:
    wait_until: networkidle
    max_scrolls: 0
    load_more_selectors: []
    capture_network_json: true
session:
  cookies_file: ./auth/cookies.txt
  storage_state: ./auth/storage.json
  headers: {}
pagination:
  enabled: true
  max_pages: 10
heal:
  enabled: true
  discovery: true
  canary: balanced
  holdout_pages: 0
plugins:
  llm:
    enabled: false
    use_for: [heal_hints]
notify:
  enabled: false
  webhook_url: https://hooks.example.com/adaparse
budgets:
  max_pages: 30
  concurrency: 3
  request_timeout_ms: 20000
  time_budget_ms: 60000
```

## CLI

Same commands as in the Russian section above.

## Optional Playwright

```bash
npm i playwright
npx playwright install chromium
```

Then set `fetch.mode: browser`. Without Playwright installed, HTTP mode still works.

## Docker

```bash
npm run build
docker build -t adaparse .
docker run --rm -v "%CD%/fixtures:/app/fixtures" -v "%CD%/out:/app/out" \
  adaparse run -c /app/fixtures/configs/demo-mock-site.yaml
```

## Responsible use

Respect site ToS, robots.txt, and local law. Budgets exist so you don't hammer servers. Don't use this to bypass auth walls, captchas, or paywalls.

## License

MIT
