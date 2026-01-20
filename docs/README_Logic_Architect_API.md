# 🧠 Logic Architect API — Инструкция для разработчиков сервера

## Обзор

Logic Architect предоставляет два режима анализа логики функций:
1. **Client-side** — прямой вызов Gemini API из браузера
2. **Server-side** — анализ через сервер 3200 (`POST /api/items/{id}/analyze-logic`)

Этот документ описывает реализацию **серверного режима** для разработчиков backend.

---

## API Endpoint

### `POST /api/items/{id}/analyze-logic`

**Назначение:** Анализ логики функции через серверный LLM (Gemini).

**Параметры:**
- `id` (path) — full_name AiItem (например, `utils.fetchData`)
- `context-code` (query) — контекстный код для изоляции данных

**Request Body:** Пустое (сервер сам загружает данные из БД по `id`)

**Response:**
```json
{
  "logic": "Текстовое описание логики функции на русском языке...",
  "graph": {
    "nodes": [
      { "id": "start_1", "type": "start", "label": "Начало" },
      { "id": "decision_1", "type": "decision", "label": "Проверка условия", "details": "..." },
      { "id": "process_1", "type": "process", "label": "Обработка данных" },
      { "id": "end_1", "type": "end", "label": "Конец" }
    ],
    "edges": [
      { "id": "e1", "from": "start_1", "to": "decision_1" },
      { "id": "e2", "from": "decision_1", "to": "process_1", "label": "Да" },
      { "id": "e3", "from": "process_1", "to": "end_1" }
    ]
  }
}
```

**Ошибки:**
- `404` — AiItem не найден
- `500` — Ошибка LLM (SDK не установлен, API ключ отсутствует, ошибка генерации)

---

## Реализация на сервере

### 1. Получение данных AiItem

Сервер загружает `l0_code`, `l1_deps`, `l2_desc` из БД по `full_name`:

```javascript
const item = await getAiItemById(id); // Ваша функция получения из БД

const metadata = {
  body: item.l0_code,           // Исходный код функции
  s_name: item.id,              // Краткое имя
  full_name: item.id,           // Полное имя
  comment: item.l2_desc,        // L2 описание
  called_functions: item.l1_deps, // Список вызываемых функций
  signature: null,              // Сигнатура (опционально)
  select_from: null             // Таблицы для чтения (опционально)
};
```

### 2. Вызов Gemini API

```javascript
const { GoogleGenAI, Type } = await import('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const response = await ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: prompt,
  config: {
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
  },
});

const result = JSON.parse(response.text);
```

---

## Промпт для анализа логики

Ниже приведён **актуальный промпт**, используемый для анализа:

```
Проанализируй следующий исходный код функции и предоставь структурированный ответ.

ИСХОДНЫЙ КОД:
${body}

МЕТАДАННЫЕ:
${JSON.stringify({
  signature: metadata.signature,
  called_functions: metadata.called_functions,
  tables: metadata.select_from,
  function_name: metadata.s_name,
  description: metadata.comment
}, null, 2)}

ТВОЯ ЗАДАЧА СОСТОИТ ИЗ ДВУХ ЧАСТЕЙ:

1. РАЗДЕЛ "logic" (Текстовое описание):
- Опиши логику работы функции на РУССКОМ ЯЗЫКЕ.
- Перечисли все вызываемые функции (используй полные имена, если они известны).
- Укажи, какие таблицы читаются (SELECT) и в какие записываются данные (INSERT/UPDATE/DELETE).
- Опиши все ветвления (if/else, switch) и циклы.
- Описание должно быть формальным и точным.
- Отформатируй текст чтобы было красиво и понятно.

2. РАЗДЕЛ "graph" (Граф потока управления):
Соблюдай строгие правила связей:
- 'start': Начало функции. Ровно ОДНА исходящая связь.
- 'decision': Развилка/условие. Минимум ДВЕ исходящие связи (например, "Да"/"Нет").
- 'process': Обычное действие или вычисление. Один вход, один выход.
- 'db_call': Операция с БД. Один вход, один выход (трактуется как процесс).
- 'end' или 'exception': Точки выхода. Минимум один вход, НОЛЬ исходящих связей.

Используй краткие и понятные метки (labels) для узлов и связей.
```

---

## JSON Schema для ответа

Gemini возвращает структурированный JSON согласно схеме:

```javascript
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    logic: {
      type: Type.STRING,
      description: "Формальное описание логики на русском языке: вызываемые функции, таблицы, условия."
    },
    graph: {
      type: Type.OBJECT,
      properties: {
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: {
                type: Type.STRING,
                enum: ['start', 'end', 'decision', 'process', 'db_call', 'exception']
              },
              label: { type: Type.STRING },
              details: { type: Type.STRING }
            },
            required: ['id', 'type', 'label']
          }
        },
        edges: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              from: { type: Type.STRING },
              to: { type: Type.STRING },
              label: { type: Type.STRING }
            },
            required: ['id', 'from', 'to']
          }
        }
      },
      required: ['nodes', 'edges']
    }
  },
  required: ['logic', 'graph']
};
```

---

## Типы узлов графа

| Тип | Описание | Цвет в UI |
|-----|----------|-----------|
| `start` | Начало функции. Ровно 1 исходящая связь | 🟢 Зелёный |
| `end` | Конец функции. 0 исходящих связей | 🔴 Красный |
| `decision` | Условие/развилка. Минимум 2 исходящих связи | 🟠 Оранжевый |
| `process` | Обычное действие. 1 вход, 1 выход | 🔵 Синий |
| `db_call` | Операция с БД. 1 вход, 1 выход | 🟣 Фиолетовый |
| `exception` | Обработка ошибок. 0 исходящих связей | 🩷 Розовый |

---

## Полный пример реализации

```javascript
// POST /api/items/:id/analyze-logic
app.post('/api/items/:id/analyze-logic', async (req, res) => {
  try {
    const { id } = req.params;
    const contextCode = req.query['context-code'] || 'default';
    
    console.log(`[API] Analyzing logic for item: ${id}`);

    // 1. Получаем AiItem из БД
    const item = await getAiItemById(id, contextCode);
    if (!item) {
      return res.status(404).json({ 
        success: false,
        error: `AiItem with id '${id}' not found` 
      });
    }

    // 2. Формируем метаданные
    const metadata = {
      body: item.l0_code,
      s_name: item.id,
      full_name: item.id,
      comment: item.l2_desc,
      called_functions: item.l1_deps,
      signature: null,
      select_from: null
    };

    // 3. Вызываем Gemini
    const result = await analyzeLogicWithGemini(item.l0_code, metadata);

    // 4. Возвращаем результат
    console.log(`[API] Logic analysis completed for: ${id}`);
    res.json(result);

  } catch (error) {
    console.error('[API] Error analyzing logic:', error);
    
    if (error.message.includes('Gemini SDK')) {
      return res.status(500).json({
        success: false,
        error: 'Gemini SDK is not installed. Run: npm install @google/genai'
      });
    }
    
    if (error.message.includes('API_KEY')) {
      return res.status(500).json({
        success: false,
        error: 'API_KEY environment variable is not configured'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to analyze logic: ' + error.message
    });
  }
});
```

---

## Требования

- **Gemini SDK:** `npm install @google/genai`
- **API Key:** Переменная окружения `API_KEY`
- **Модель:** `gemini-3-flash-preview` (поддерживает structured output)

---

## Связанные endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/items/{id}/analyze-logic` | POST | Анализ логики через LLM |
| `/api/items/{id}/logic-graph` | GET | Получить сохранённый анализ |
| `/api/items/{id}/logic-graph` | POST | Сохранить анализ |
| `/api/items/{id}/logic-graph` | PUT | Обновить анализ |
| `/api/items/{id}/logic-graph` | DELETE | Удалить анализ |

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  LogicArchitectDialog (UI)                                  │
│    ├── Build (Client) → logicAnalyzerService → Gemini API  │
│    └── Build (Server) → apiClient → Server 3200 → Gemini   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Server 3200                                                 │
│    POST /api/items/:id/analyze-logic                         │
│      1. getAiItemById(id) → БД                              │
│      2. analyzeLogicWithGemini(body, metadata) → Gemini API │
│      3. return { logic, graph }                             │
└─────────────────────────────────────────────────────────────┘
```

---

*Последнее обновление: Январь 2026*
