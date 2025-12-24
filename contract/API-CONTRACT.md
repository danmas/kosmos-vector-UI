# 📋 Backend API Contract

**Контракт (спецификация) для backend серверов AiItem RAG Architect системы**

## 🎯 Назначение

Этот контракт определяет стандартный интерфейс для backend серверов, позволяя любым серверам интегрироваться с UI интерфейсом AiItem RAG Architect. Спецификация обеспечивает:

- **Строгую совместимость** всех endpoints и типов данных
- **Единый формат** запросов и ответов
- **Валидацию** соответствия реализации контракту
- **Документацию** для разработчиков

## 📁 Файлы контракта

### `api-contract.yaml`
**Полная OpenAPI 3.0 спецификация** всех endpoints системы:

- ✅ **25+ endpoints** с полной документацией
- ✅ **Детальные схемы данных** для всех типов
- ✅ **Примеры запросов/ответов** для каждого endpoint
- ✅ **Коды ошибок** и их описания
- ✅ **SSE streaming endpoints** документация

### `middleware/contractValidator.js`
**Middleware для валидации** соответствия API контракту:

- Проверяет структуру ответов согласно OpenAPI схемам
- Валидирует HTTP статус коды
- Проверяет обязательные поля и типы данных
- Логирует нарушения контракта

## 🚀 Использование

### 1. Получение спецификации

```bash
# Получить YAML спецификацию
GET /api/contract

# Получить JSON спецификацию (требует js-yaml)
GET /api/contract?format=json
```

### 2. Интеграция валидации

```javascript
import { contractValidationMiddleware } from './middleware/contractValidator.js';

// Добавить middleware в Express приложение
app.use(contractValidationMiddleware({
  enabled: process.env.NODE_ENV === 'development',
  logErrors: true,
  logWarnings: true,
  throwOnError: false
}));
```

### 3. Проверка соответствия

```bash
# Проверить health endpoint (порт по умолчанию 3200, настраивается через PORT_DATA_SERVER)
curl http://localhost:${PORT_DATA_SERVER:-3200}/api/health

# Ожидаемый ответ:
{
  "status": "ok",
  "timestamp": "2024-01-20T12:00:00.000Z", 
  "version": "2.0.0",
  "endpoints": ["items", "stats", "graph", "chat", "files", "logs", "pipeline", "kb-config", "contract"]
}
```

## 📊 Группы Endpoints

### 🔧 Core API
- `GET /api/health` - Health check
- `GET /api/items` - Все AiItems
- `GET /api/items/{id}` - Конкретный AiItem
- `GET /api/stats` - Статистика Dashboard
- `GET /api/graph` - Данные для Knowledge Graph

### ⚙️ Knowledge Base Configuration  
- `GET /api/kb-config` - Получить настройки KB
- `POST /api/kb-config` - Обновить настройки KB

### 🤖 RAG Chat
- `POST /api/chat` - Отправить запрос в RAG систему

### 🔄 Pipeline Management
- `POST /api/pipeline/start` - Запустить pipeline
- `GET /api/pipeline/{id}` - Статус pipeline
- `GET /api/pipeline` - Все pipeline
- `DELETE /api/pipeline/{id}` - Отменить pipeline
- `GET /api/pipeline/{id}/progress` - Детальный прогресс
- `GET /api/pipeline/stats/global` - Глобальная статистика
- `GET /api/pipeline/errors` - Статистика ошибок
- `POST /api/pipeline/step/{stepId}/run` - Запустить шаг
- `GET /api/pipeline/steps/status` - Статус всех шагов

### 📡 Streaming (SSE)
- `GET /api/logs/stream` - Поток логов
- `GET /api/pipeline/{id}/stream` - Прогресс pipeline
- `GET /api/pipeline/stream/global` - Глобальные события

### 📄 File Operations
- `GET /api/logs` - Логи сервера
- `GET /api/files` - Файловая структура

### 🔧 System
- `GET /api/contract` - OpenAPI спецификация

## 🏗️ Ключевые типы данных

### AiItem
```typescript
{
  id: string;           // Уникальный идентификатор
  type: AiItemType;     // function | class | method | interface | struct
  language: Language;   // python | typescript | javascript | go | java
  l0_code: string;      // Исходный код (AST)
  l1_deps: string[];    // Граф зависимостей
  l2_desc: string;      // LLM описание
  filePath: string;     // Путь к файлу
}
```

### StandardResponse
```typescript
// Success
{
  success: true;
  // + специфичные поля
}

// Error  
{
  success: false;
  error: string;
}
```

## 🔒 Требования совместимости

### Обязательные endpoints
Все серверы **ДОЛЖНЫ** реализовать:
- `GET /api/health` - для проверки работоспособности
- `GET /api/contract` - для получения спецификации
- `GET /api/items` - базовая функциональность

### Формат ответов
- **2xx статусы**: `success: true` + данные
- **4xx/5xx статусы**: `success: false, error: "message"`
- **Content-Type**: `application/json` (кроме SSE)

### Валидация
- Используйте `contractValidationMiddleware` для автоматической проверки
- Логируйте нарушения контракта в development режиме
- Тестируйте все endpoints против OpenAPI схем

## 🧪 Тестирование

### Swagger UI
Загрузите `api-contract.yaml` в [Swagger Editor](https://editor.swagger.io/) для интерактивного тестирования.

### Автоматические тесты
```javascript
import { validateApiResponse } from './middleware/contractValidator.js';

// Валидация в тестах
const validation = validateApiResponse('GET', '/api/health', 200, response);
expect(validation.valid).toBe(true);
expect(validation.errors).toHaveLength(0);
```

## 🌐 Среды развертывания

### Development
```bash
# Включить валидацию контракта
export NODE_ENV=development
export VALIDATE_CONTRACT=true
npm start
```

### Production
```bash 
# Отключить валидацию для производительности
export NODE_ENV=production
export VALIDATE_CONTRACT=false
npm start
```

## 📞 Поддержка

При возникновении вопросов по контракту:

1. Проверьте `api-contract.yaml` - полная документация всех endpoints
2. Используйте `contractValidationMiddleware` для отладки
3. Смотрите логи валидации в development режиме
4. Тестируйте endpoints через `GET /api/contract`

---

**✨ Контракт обеспечивает единый стандарт для всех backend серверов AiItem RAG Architect системы!**
