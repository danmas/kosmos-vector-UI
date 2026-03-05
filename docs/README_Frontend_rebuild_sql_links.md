# Пересборка L1-связей из клиентской БД — инструкция для фронтенда

## Назначение

Эндпоинт **POST /api/items/{id}/rebuild-sql-links** пересобирает L1-связи (граф зависимостей) для одного AiItem, получая данные **напрямую из клиентской PostgreSQL** (POSTGRES_URL), а не из чанков. Подходит для SQL-функций и таблиц.

После вызова обновляются:
- таблица `link` (исходящие связи: вызовы функций, чтение/запись таблиц);
- L1-чанк в `chunk_vector`.

---

## Как вызывать

### URL и метод

| Метод | URL |
|-------|-----|
| POST | `/api/items/{id}/rebuild-sql-links` |

**Базовый URL сервера:** из конфигурации приложения (например `http://localhost:3200` или `BASE_URL`).

### Параметры

| Параметр | Расположение | Обязательный | Описание |
|----------|--------------|--------------|----------|
| `id` | path | да | **full_name** AiItem (например `carl_inspect._getCityFromReport`). Для функций — `schema.function_name`, для таблиц — `schema.table_name`. |
| `context-code` | query | да | Код контекста (например `CARL`). Используется для изоляции данных и обязателен для всех маршрутов под `/api`. |

Тело запроса (request body) **не требуется** — сервер сам находит объект в векторной БД и запрашивает данные из клиентской БД.

### Пример запроса

```http
POST /api/items/carl_inspect._getCityFromReport/rebuild-sql-links?context-code=CARL
Content-Type: application/json
```

Если `id` содержит спецсимволы, его нужно кодировать: `encodeURIComponent(id)`.

---

## Успешный ответ (200)

```json
{
  "success": true,
  "report": {
    "fullName": "carl_inspect._getCityFromReport",
    "type": "function",
    "linksDeleted": 5,
    "linksCreated": 4,
    "l1Result": {
      "called_functions": ["carl_inspect._someFunc"],
      "select_from": ["carl_inspect.some_table"],
      "update_tables": [],
      "insert_tables": []
    },
    "chunkUpdated": true,
    "errors": []
  }
}
```

- **linksDeleted** — сколько старых связей удалено в `link`.
- **linksCreated** — сколько новых связей добавлено.
- **l1Result** — распарсенные зависимости (для таблиц будут `foreign_keys` и `referenced_tables`).
- **chunkUpdated** — был ли обновлён или создан L1-чанк.
- **errors** — массив строк с ошибками по отдельным связям (если были); при успехе обычно пустой.

---

## Ошибки

| Код | Когда |
|-----|--------|
| **400** | AiItem не является функцией или таблицей (тип не поддерживается для rebuild-sql-links). |
| **404** | AiItem с таким `full_name` не найден в векторной БД **или** объект не найден в клиентской БД (POSTGRES_URL). |
| **500** | Ошибка подключения к клиентской БД, парсинга или записи. |

Тело ошибки:

```json
{
  "success": false,
  "error": "AiItem with full_name '...' not found"
}
```

---

## Пример вызова с фронта (JavaScript/TypeScript)

```ts
const baseUrl = 'http://localhost:3200'; // или из конфига
const contextCode = 'CARL';
const fullName = 'carl_inspect._getCityFromReport';

const url = `${baseUrl}/api/items/${encodeURIComponent(fullName)}/rebuild-sql-links?context-code=${encodeURIComponent(contextCode)}`;

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
});

const data = await res.json();

if (!res.ok) {
  console.error(data.error ?? 'Rebuild failed');
  return;
}

console.log('Links created:', data.report.linksCreated);
console.log('Links deleted:', data.report.linksDeleted);
```

---

## Когда показывать кнопку/действие

- Имеет смысл для AiItem с **type = `function`** или **type = `table`** (для остальных типов сервер вернёт 400).
- На сервере должен быть настроен **POSTGRES_URL**; иначе возможна 500 или 404 при обращении к клиентской БД.
- После успешного вызова можно обновить карточку элемента или граф зависимостей (например, перезапросить `GET /api/items/{id}` или `GET /api/graph`), чтобы отобразить новые связи.

---

## См. также

- OpenAPI: в контракте `docs/api-contract.yaml` путь `/api/items/{id}/rebuild-sql-links`, схемы `RebuildSqlLinksResponse`, `RebuildSqlLinksReport`.
- Граф зависимостей: `GET /api/graph?context-code=...` — возвращает все связи, включая пересобранные через rebuild-sql-links.
