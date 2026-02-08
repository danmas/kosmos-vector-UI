# Векторизация ai_item — инструкция для фронтенда

Эндпоинт **POST /vectorize-ai-items** создаёт или обновляет эмбеддинги для всех чанков выбранных ai_item. Один элемент или список — один и тот же маршрут.

---

## URL и метод

- **Метод:** `POST`
- **Путь:** `/vectorize-ai-items`  
  (в текущем сервере роуты файлов смонтированы в корне; при наличии префикса по контракту путь может быть `/api/files/vectorize-ai-items` — уточните у бэкенда.)
- **Content-Type:** `application/json`

---

## Параметры вызова

### Query (всегда в URL)

| Параметр       | Тип    | Обязательный | Описание |
|----------------|--------|--------------|----------|
| `context-code` | string | Да, если в body передан `fullNames` | Код контекста (например `"CARL"`). При вызове по **fullNames** обязателен. При вызове по **aiItemIds** можно не передавать. |

Пример: `POST /vectorize-ai-items?context-code=CARL`

### Body (JSON)

Передаётся **один из двух** способов идентификации элементов:

| Поле          | Тип           | Описание |
|---------------|----------------|----------|
| `aiItemIds`   | number[]       | Список id записей из таблицы ai_item. Подходит для одного или нескольких элементов. |
| `fullNames`   | string[]       | Список полных имён (full_name). **Обязателен** query-параметр `context-code`. |
| `force`       | boolean        | По умолчанию `false`. Если `true` — перевекторизовать все чанки (перезаписать уже существующие эмбеддинги). |

- Либо **aiItemIds**, либо **fullNames** — не оба сразу (логика: при наличии aiItemIds используем их; иначе fullNames + context-code).
- При **fullNames** без `context-code` в query бэкенд вернёт **400**.

---

## Примеры запросов

### По id элементов (один или несколько)

```http
POST /vectorize-ai-items
Content-Type: application/json

{
  "aiItemIds": [1, 5, 12],
  "force": false
}
```

### По full_name (обязателен context-code в query)

```http
POST /vectorize-ai-items?context-code=MY_KB
Content-Type: application/json

{
  "fullNames": ["schema.users.getById", "schema.orders.create"],
  "force": true
}
```

### Один элемент по id

```http
POST /vectorize-ai-items
Content-Type: application/json

{
  "aiItemIds": [7],
  "force": false
}
```

---

## Ответ (200 OK)

```json
{
  "success": true,
  "totalItems": 2,
  "chunksUpdated": 5,
  "results": [
    { "aiItemId": 1, "chunksUpdated": 2 },
    { "aiItemId": 5, "chunksUpdated": 3 }
  ]
}
```

При частичных ошибках (например, падение эмбеддинга для одного из item) в ответе добавляется массив **errors**:

```json
{
  "success": true,
  "totalItems": 2,
  "chunksUpdated": 1,
  "results": [
    { "aiItemId": 1, "chunksUpdated": 1 },
    { "aiItemId": 5, "chunksUpdated": 0 }
  ],
  "errors": [
    { "aiItemId": 5, "message": "embedding API error: ..." }
  ]
}
```

Поля ответа:

- **success** — всегда `true` при коде 200 (даже при непустом `errors`).
- **totalItems** — сколько ai_item обработано.
- **chunksUpdated** — сколько чанков получили новый эмбеддинг.
- **results** — по каждому ai_item: id и количество обновлённых чанков.
- **errors** — опционально; при частичных сбоях по item’ам.

---

## Ошибки

| Код | Когда |
|-----|--------|
| **400** | Не передан ни `aiItemIds`, ни `fullNames`; или передан `fullNames`, но в query нет `context-code`. Тело: `{ "error": "строка с описанием" }`. |
| **500** | Ошибка сервера. Тело: `{ "error": "..." }`. |

---

## Пример на fetch (JavaScript/TypeScript)

```javascript
const BASE_URL = 'http://localhost:3005'; // или ваш хост

// Векторизация по id
async function vectorizeByIds(aiItemIds, force = false) {
  const url = new URL(`${BASE_URL}/vectorize-ai-items`);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aiItemIds, force })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Vectorize failed');
  return data;
}

// Векторизация по full_name (context-code обязателен)
async function vectorizeByFullNames(fullNames, contextCode, force = false) {
  const url = new URL(`${BASE_URL}/vectorize-ai-items`);
  url.searchParams.set('context-code', contextCode);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullNames, force })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Vectorize failed');
  return data;
}

// Использование
const result = await vectorizeByIds([1, 2, 3]);
console.log(result.chunksUpdated, result.results);

// С перевекторизацией
const result2 = await vectorizeByFullNames(['schema.users.getById'], 'CARL', true);
if (result2.errors?.length) {
  console.warn('Частичные ошибки:', result2.errors);
}
```

---

## Кратко для копипаста

- **Один или много по id:** `POST /vectorize-ai-items`, body: `{ "aiItemIds": [1, 2], "force": false }`.
- **По full_name:** в query обязательно `context-code`, body: `{ "fullNames": ["..."], "force": false }`.
- **Перевекторизовать:** тот же запрос с `"force": true`.

Полная спецификация: [docs/api-contract.yaml](api-contract.yaml), операция `vectorizeAiItems` (path `/api/files/vectorize-ai-items`).
