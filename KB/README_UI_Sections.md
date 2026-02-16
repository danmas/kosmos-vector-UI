# Разделы пользовательского интерфейса kosmos-vector-UI

## Обзор проекта

**kosmos-vector-UI** — это веб-интерфейс (UI-оболочка) для проекта **kosmos-vector**, который содержит основной функционал анализа кода и построения базы знаний. UI предоставляет удобный интерактивный доступ ко всем возможностям системы.

### Архитектура
- **Frontend**: React 19 + TypeScript + Vite
- **Визуализация**: D3.js 7.9.0 (графы), Recharts (диаграммы)
- **Backend**: Node.js + Express (см. проект kosmos-vector)
- **AI Integration**: Google Gemini (2.5 Flash, Embedding 004)
- **Vector DB**: FAISS / ChromaDB

## Структура левой панели (Sidebar)

Главная навигация состоит из 6 основных разделов:

### 1. 📊 Dashboard (Панель управления)
**Файл документации**: [README_Dashboard.md](./README_Dashboard.md)

**Описание**: Главный экран с обзором статистики проекта.

**Ключевые функции**:
- Карточки статистики (Total AiItems, Knowledge Links, Vector Index Size)
- Диаграммы распределения по типам и языкам
- Информация о миграции API v2.1.1
- Demo Mode с mock-данными

**Технологии**: React, Recharts, DataCacheContext

---

### 2. 🗄️ Knowledge Base (База знаний)
**Файл документации**: [README_Knowledge_Base.md](./README_Knowledge_Base.md)

**Описание**: Продвинутый проводник файлов для выбора файлов проекта.

**Ключевые функции**:
- Выбор папки проекта и сканирование структуры
- Два режима выбора: по маске (glob) и ручной
- Дерево файлов с чекбоксами и статистикой
- Встроенный просмотрщик файлов
- API v2.1.1 с fileSelection и includeMask
- Автосохранение конфигурации (debounce 1с)

**Технологии**: React, minimatch, FileViewerDialog

---

### 3. ⚙️ Processing (Обработка)
**Файл документации**: [README_Processing.md](./README_Processing.md)

**Описание**: Управление пайплайном обработки кода (5 шагов).

**Ключевые функции**:
- **Step 1**: Polyglot Parsing (L0) — AST разбор
- **Step 2**: Dependency Analysis (L1) — граф зависимостей
- **Step 3**: Semantic Enrichment (L2) — LLM описания
- **Step 4**: Vectorization — создание эмбеддингов
- **Step 5**: Index Construction — FAISS индекс
- Конфигурация моделей (Gemini, OpenAI, Local)
- История запусков и очистка векторной БД
- Автообновление статусов (polling 2с)

**Технологии**: React, REST API, polling, pipeline configs

---

### 4. 🔍 Data Inspector (Инспектор данных)
**Файл документации**: [README_Data_Inspector.md](./README_Data_Inspector.md)

**Описание**: Детальный просмотр и управление AiItems.

**Ключевые функции**:
- Список всех проанализированных элементов кода
- Поиск с поддержкой regex и история запросов
- Фильтрация по типам и тегам
- Три вкладки детализации: L0 (код), L1 (связи), L2 (семантика)
- Система тегов с массовыми операциями
- Векторизация (индивидуальная и массовая)
- Extract Columns для SQL-функций
- Natural Language Query
- Синхронизация с Graph View

**Технологии**: React, regex, GraphFilterContext, TagsDialog

---

### 5. 🕸️ Graph View (Граф зависимостей)
**Файл документации**: [README_Graph_View.md](./README_Graph_View.md)

**Описание**: Интерактивная визуализация графа зависимостей (L1).

**Ключевые функции**:
- Силовой граф D3.js с физической симуляцией
- Разные формы узлов по типам (круги, квадраты, прямоугольники)
- Цветовая кодировка по типам AiItems
- История кликов с жёлтой подсветкой (5 уровней)
- Интерактивность: zoom, pan, drag, клики (одиночный, двойной, Ctrl, Alt)
- Persistent tooltip с деталями узла
- Модальное окно с L0/L1/L2 вкладками
- Расширенный поиск с wildcards и regex
- Фильтрация по типам и тегам
- Синхронизация с Data Inspector

**Технологии**: React, D3.js v7.9.0, force simulation, Barnes-Hut

---

### 6. 💬 RAG Client (Чат-ассистент)
**Файл документации**: [README_RAG_Client.md](./README_RAG_Client.md)

**Описание**: Интерактивный чат для вопросов о кодовой базе.

**Ключевые функции**:
- Диалог с AI на естественном языке
- RAG (Retrieval-Augmented Generation)
- Отображение использованного контекста (retrieved items)
- Сохранение истории в localStorage (изолировано по context)
- RAG Test Dialog для тестирования извлечения
- 4 стратегии поиска: Semantic, Keyword, Hybrid, Rerank
- Обработка ошибок (API key, SDK, demo mode)
- Автопрокрутка и плавные анимации

**Технологии**: React, Google Gemini API, localStorage, RAGTestDialog

---

## Дополнительные разделы (не в основной навигации)

### Server Logs (Логи сервера)
- **Кнопка**: 📟 Server Logs (внизу sidebar)
- **Режимы**: dialog, window, tab (настраивается через VITE_SERVER_LOGS_OPEN_MODE)
- **Фильтрация**: По context-code
- **Компонент**: ServerLogsDialog

**Диалог и REST API**:
| Маршрут | Метод | Описание |
|---------|-------|----------|
| `/api/logs/stream` | EventSource (GET) | SSE-поток логов. Порт: VITE_BACKEND_PORT (3200) |

---

### Prompts Editor (Редактор промптов)
- **Кнопка**: ✏️ Prompts Editor (внизу sidebar)
- **Назначение**: Редактирование системных промптов для LLM
- **Компонент**: PromptsEditorDialog

**Диалог и REST API**:
| Маршрут | Метод | Описание |
|---------|-------|----------|
| `/api/prompts/:category` | GET | Загрузка промптов категории (naturalQuery, rag, vectorOperations) |
| `/api/prompts/:category` | PATCH | Обновление промптов категории |
| `/api/prompts/reload` | POST | Перезагрузка промптов из файла |

---

### Settings (Настройки)
- **Кнопка**: ⚙️ Settings (внизу sidebar)
- **Назначение**: Настройки системы (порт 3200). Вкладки: App Config, Prompts Config, Item Types
- **Компонент**: SettingsDialog

**Диалог и REST API** (вкладки):

| Вкладка | Маршрут | Метод | Описание |
|---------|---------|-------|----------|
| App Config | `/api/config` | GET | Текущая конфигурация приложения |
| App Config | `/api/config` | PATCH | Частичное обновление |
| App Config | `/api/config/reset` | POST | Сброс к значениям по умолчанию |
| Prompts Config | `/api/prompts-config` | GET | Конфигурация промптов |
| Prompts Config | `/api/prompts-config` | PATCH | Обновление промптов |
| Prompts Config | `/api/prompts-config/history` | GET | История изменений |
| Prompts Config | `/api/prompts-config/restore/:id` | POST | Восстановление версии |
| Prompts Config | `/api/prompts-config/reset` | POST | Сброс промптов |
| Item Types | `/api/types` | GET | Список типов AI Items |
| Item Types | `/api/types` | POST | Создание кастомного типа |
| Item Types | `/api/types/:code` | PUT | Обновление типа |
| Item Types | `/api/types/:code` | DELETE | Удаление кастомного типа |

---

## Context Code System

### Изоляция данных
Все разделы поддерживают систему **Context Code** для изоляции данных:
- Каждый context — отдельный проект/ветка
- Переключение через dropdown в заголовке sidebar
- Изолированные данные:
  - История чата (localStorage)
  - Статистика dashboard
  - Граф зависимостей
  - Конфигурация KB
  - Статусы pipeline

### Глобальная переменная
```javascript
window.g_context_code = 'CARL' // или другой context
```

### Context-aware компоненты
Все компоненты автоматически:
- Загружают данные для текущего context
- Обновляются при смене context
- Сохраняют состояние раздельно

---

## Кэширование (DataCacheContext)

### Механизм
- **Первый запрос**: Проверка кэша → сервер → сохранение
- **Последующие**: Только кэш (до инвалидации)
- **Инвалидация**: При завершении pipeline steps
- **Prefetch**: Автоматическая предзагрузка при смене context

### Кэшируемые данные
- Dashboard stats
- Items list (AiItemSummary[])
- Graph data (nodes + links)
- KB configuration

### Индикаторы
- **Cached** — зелёный бейдж (данные из кэша)
- **Demo** — янтарный бейдж (mock-данные)
- **Loading** — индикатор загрузки

---

## Фильтрация (GraphFilterContext)

### Координация между компонентами
- **Inspector → Graph**: `filteredItemIds` обновляет видимые узлы
- **Graph → Inspector**: `graphSearch` синхронизирует поиск
- **Filter Dialog**: Общий диалог для типов и тегов
- **История**: Сохранение последних 10 запросов

### Состояние фильтров
```typescript
{
  filteredItemIds: Set<string>,
  inspectorSearch: string,
  graphSearch: string,
  typeFilterEnabled: boolean,
  selectedTypes: Set<AiItemType>,
  tagFilterEnabled: boolean,
  selectedTagCodes: Set<string>,
  filterHistory: string[]
}
```

---

## Система тегов

### Возможности
- Создание новых тегов (code, name, description)
- Добавление тегов к элементам
- Удаление тегов
- Массовые операции (bulk add/remove)
- Фильтрация по тегам
- Отображение в списках и на графе

### API
```
GET    /api/items/:id/tags
POST   /api/items/:id/tags
DELETE /api/items/:id/tags
POST   /api/tags/bulk-add
POST   /api/tags/bulk-remove
```

---

## Векторизация

### Уровни векторизации
1. **Индивидуальная** — кнопка V у элемента
2. **Массовая** — V+ (новые) / V* (все) в Inspector
3. **Pipeline Step 4** — полная векторизация проекта

### Параметры
- **Модель**: Gemini text-embedding-004 (по умолчанию)
- **Batch size**: 5 элементов
- **Force mode**: Перезапись существующих векторов
- **Прогресс**: Индикатор "X / Y элементов"

### Состояние
- **Не векторизован**: Серая кнопка V
- **Векторизован**: Голубая кнопка V
- **В процессе**: Анимация загрузки

---

## Технологический стек

### Frontend
- **React**: 19.x
- **TypeScript**: 5.x
- **Vite**: 6.x (build tool)
- **D3.js**: 7.9.0 (графы)
- **Recharts**: 2.x (диаграммы)
- **Minimatch**: Glob patterns
- **Tailwind CSS**: 3.x (стилизация)

### Backend (kosmos-vector)
- **Node.js**: Express server
- **Python**: Парсеры (tree-sitter)
- **AI**: Google Gemini API
- **Vector DB**: FAISS / ChromaDB

### Интеграция
- **REST API**: JSON over HTTP
- **SSE**: Server-Sent Events для pipeline
- **localStorage**: История и настройки
- **WebSockets**: (будущее для real-time)

---

## Навигация по документации

### Полные описания разделов
1. [Dashboard](./README_Dashboard.md) — статистика и обзор
2. [Knowledge Base](./README_Knowledge_Base.md) — выбор файлов
3. [Processing](./README_Processing.md) — пайплайн обработки
4. [Data Inspector](./README_Data_Inspector.md) — детальный просмотр
5. [Graph View](./README_Graph_View.md) — визуализация графа
6. [RAG Client](./README_RAG_Client.md) — чат-ассистент

### Дополнительная документация
- [FILE_SELECTION_GUIDE.md](./FILE_SELECTION_GUIDE.md) — руководство по выбору файлов
- [README_Graph.md](./README_Graph.md) — детали работы с графом

### Документация API
- `contract/API-CONTRACT.md` — полный контракт API
- `contract/BACKEND_IMPLEMENTATION_v2.5.1.md` — реализация бэкенда

---

## Быстрый старт для разработчиков

### Установка
```bash
npm install
```

### Запуск dev-сервера
```bash
npm run dev
```

### Запуск backend (kosmos-vector)
```bash
cd ../kosmos-vector
npm run server
```

### Переменные окружения
```env
VITE_FILE_OPEN_MODE=dialog        # dialog/window/tab
VITE_SERVER_LOGS_OPEN_MODE=window # dialog/window/tab
```

### Порты
- **Frontend**: 5173 (Vite dev server)
- **Backend API**: 3100 (kosmos-vector)
- **Settings UI**: 3200 (если используется)

---

## Заключение

Данная документация охватывает все 6 основных разделов пользовательского интерфейса kosmos-vector-UI. Каждый раздел имеет собственный детальный README с описанием функционала, API, технических деталей и примеров использования.

Для получения подробной информации о конкретном разделе — открывайте соответствующий README файл.
