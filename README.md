# 📚 AiItem RAG Architect

**AiItem RAG Architect** — это визуальная платформа для RAG-анализа (Retrieval-Augmented Generation) кодовой базы. Система превращает исходный код в структурированную базу знаний, позволяя разработчикам визуализировать зависимости и задавать вопросы о логике проекта через AI-ассистента.

## 🆕 Обновления v2.0

- ✅ **API-driven архитектура**: Все данные теперь получаются через REST API
- ✅ **Переиспользуемые компоненты**: Создан npm пакет `@aiitem/ui-components`
- ✅ **Серверный RAG**: Gemini API перенесен на backend для безопасности
- ✅ **Умная обработка ошибок**: Четкие сообщения вместо автоматических fallback
- ✅ **Конфигурируемость**: Легкая адаптация для разных проектов
- ✅ **Backend API Contract**: OpenAPI 3.0 спецификация для интеграции других серверов
- ✅ **Logic Architect**: Интеграция визуализации логики функций через Gemini 3 Flash (v2.1)
- ✅ **Knowledge Base Configuration v2.1.1**: Два режима выбора файлов — по маске и ручной выбор с сохранением
- ✅ **Natural Query Engine v2.2.0**: Компактный плавающий виджет для анализа кодовой базы через запросы на естественном языке
- ✅ **Smart UI Architect**: Поддержка перетаскивания (Drag&Drop), изменения размера окон и продвинутого автодополнения (v2.2.1)
- ✅ **Natural Query Dialog Fixes**: Детальная обработка ошибок с выводом `human`-сообщений и синхронизация фильтров между Инспектором и Графом (v2.2.2)
- ✅ **Браузерная фильтрация**: Мгновенное применение масок без перезагрузки дерева

## 🚀 Ключевые возможности

### 1. Мультиязычность (Polyglot Support)
Система поддерживает парсинг и анализ семантики для следующих языков:
*   **Python** (Functions, Classes)
*   **TypeScript / JavaScript** (React Components, Utils)
*   **Go** (Structs)
*   **Java** (Interfaces, Classes)

### 2. Концепция AiItem (3-Layer Knowledge)
Каждая единица кода (функция, класс, метод) преобразуется в объект **AiItem** с тремя уровнями данных:
*   **L0 (Source)**: Исходный код (AST/Tree-sitter ноды).
*   **L1 (Topology)**: Граф зависимостей (кто вызывает, кого вызывает).
*   **L2 (Semantics)**: Человекочитаемое описание логики, сгенерированное LLM.

### 3. Инструменты анализа
*   **Dashboard**: Общая статистика по типам элементов и распределению языков.
*   **Knowledge Graph**: Интерактивный граф зависимостей (D3.js).
*   **Inspector**: Детальный просмотрщик AiItem с вкладками L0/L1/L2 и отслеживанием обратных зависимостей (Used By).
*   **Logic Architect**: Визуализация логики функций через граф потока управления (CFG) с помощью **Gemini 3 Flash**. Доступен из Inspector на вкладке L2.
*   **RAG Client**: Чат-бот на базе **Gemini 2.5 Flash**, отвечающий на вопросы с учетом контекста проекта.
*   **File Explorer v2.1.1**: Умный выбор файлов с двумя режимами:
  - **🎯 По маске**: Автоматический выбор файлов по glob-паттернам (например, `**/*api_*.sql`)
  - **✋ Ручной выбор**: Точный выбор файлов с сохранением и восстановлением после перезагрузки
  - **📁 Умные игноры**: Служебные папки (`.cursor`, `.git`, `.vscode`, `node_modules` и др.) автоматически игнорируются и отображаются схлопнутыми
*   **Natural Query Engine v2.2.1**: Компактный плавающий виджет для сложных аналитических запросов.
  - **💬 Естественный язык**: Генерация JS-сценариев анализа на лету.
  - **🚀 Быстрый доступ**: Доступен из Graph и Inspector.
  - **⌨️ Умная история**: Автодополнение запросов с клавиатурной навигацией.
  - **📑 Прозрачность**: Просмотр сгенерированного кода с подсветкой синтаксиса.
  - **⚠️ Отладка**: Подробные сообщения об ошибках выполнения скриптов с возможностью просмотра проблемного кода в UI (v2.2.2).
  - **🔗 Синхронизация**: Результаты Natural Query из Инспектора автоматически фильтруют Knowledge Graph (v2.2.2).

---

## 🛠 Технический стек

*   **Frontend**: React 19 + TypeScript + Vite
*   **Backend**: Node.js / Express (REST API)
*   **AI Integration**: 
  - Google GenAI SDK (`gemini-2.5-flash`) - серверная сторона для RAG
  - Google GenAI SDK (`gemini-3-flash-preview`) - клиентская сторона для Logic Architect
*   **Styling**: Tailwind CSS
*   **Визуализация**: D3.js (граф зависимостей, граф логики), Recharts (статистика)
*   **Иконки**: Lucide React
*   **Сборка библиотеки**: Rollup + TypeScript

---

## 📂 Структура проекта

```text
/
├── backend/            # Серверная часть (Node.js)
│   ├── server.js       # Express API сервер
│   ├── api-contract.yaml # OpenAPI 3.0 спецификация
│   ├── middleware/     # Validation middleware
│   └── API-CONTRACT.md # Документация контракта
├── components/         # React UI компоненты
│   ├── ChatInterface   # RAG чат (использует /api/chat)
│   ├── Dashboard       # Статистика (использует /api/stats)
│   ├── FileExplorer    # Дерево файлов (использует /api/files)
│   ├── Inspector       # Детальный просмотр (использует /api/items)
│   ├── KnowledgeGraph  # D3 граф (использует /api/graph)
│   ├── LogicArchitectDialog # Диалог визуализации логики функций
│   ├── LogicVisualizer # D3 визуализатор графа потока управления
│   ├── LogViewer       # Логи сервера (использует /api/logs)
│   ├── PipelineView    # Визуализация процесса
│   └── Sidebar         # Навигация
├── services/           # API клиенты
│   ├── apiClient.ts    # Централизованный HTTP клиент
│   ├── geminiService.ts # [DEPRECATED] Перенесен на сервер
│   └── logicAnalyzerService.ts # Анализ логики функций через Gemini 3 Flash
├── lib/                # Переиспользуемая библиотека
│   ├── index.ts        # Главный экспорт
│   ├── context/        # React контексты
│   ├── hooks/          # Пользовательские хуки
│   ├── README.md       # Документация библиотеки
│   └── example.tsx     # Примеры использования
├── constants.ts        # Мок-данные (для demo режима)
├── types.ts            # TypeScript интерфейсы
├── rollup.config.js    # Конфигурация сборки библиотеки
├── App.tsx             # Главное приложение
├── server.js           # Точка входа сервера
└── README.md           # Документация проекта
```

## 🚦 Запуск приложения

### Предварительные требования

```bash
# Установка зависимостей
npm install

# Для функциональности чата установите Gemini SDK
npm install @google/genai

# Для сборки библиотеки установите rollup зависимости
npm install --save-dev @rollup/plugin-commonjs @rollup/plugin-node-resolve @rollup/plugin-typescript rollup rollup-plugin-peer-deps-external rollup-plugin-terser
```

### Запуск Backend сервера

```bash
# Запуск API сервера (порт 3200 по умолчанию)
node server.js

# Или с переменными окружения
PORT_DATA_SERVER=3200 API_KEY=your_gemini_api_key node server.js
```

### Запуск Frontend

```bash
# Режим разработки
npm run dev

# Сборка для продакшена
npm run build

# Предварительный просмотр
npm run preview
```

### Сборка переиспользуемой библиотеки

```bash
# Сборка npm пакета компонентов
npm run build:lib

# Публикация (после сборки)
npm publish
```

### Переменные окружения

**Backend (.env):**
- `PORT_DATA_SERVER` - порт сервера данных (по умолчанию 3200)
- `API_KEY` - ключ Gemini API для чат функциональности
- `PROJECT_ROOT` - корневая папка для сканирования файлов

**Frontend (.env):**
- `VITE_GEMINI_API_KEY` - ключ Gemini API для Logic Architect (должен начинаться с `VITE_` для доступа в клиентском коде)
- `VITE_API_KEY` - альтернативное имя переменной для API ключа

**Важно:** В Vite переменные окружения должны начинаться с `VITE_` для доступа в клиентском коде. Это требование безопасности.

## 🔄 Pipeline работы

1.  **Parsing**: Сканирование файлов по маске `**/*.{py,js,ts,go,java}`.
2.  **Linking (L1)**: Построение графа вызовов между элементами.
3.  **Enrichment (L2)**: Генерация описаний через LLM для каждого узла.
4.  **Vectorization**: Создание эмбеддингов для семантического поиска.
5.  **Retrieval**: Поиск релевантных фрагментов кода при вопросе пользователя.

## 🧠 Logic Architect

**Logic Architect** — это инструмент визуализации логики функций и хранимых процедур, интегрированный в Inspector. Он использует **Gemini 3 Flash** для анализа исходного кода и построения графа потока управления (Control Flow Graph).

### Возможности

- **Автоматический анализ**: Анализирует `l0_code` выбранного AiItem через Gemini API
- **Визуализация графа**: Интерактивный D3.js граф с узлами типов:
  - `start` - начало функции (зеленый)
  - `end` - конец функции (красный)
  - `decision` - условия/развилки (оранжевый)
  - `process` - обычные операции (синий)
  - `db_call` - операции с БД (фиолетовый)
  - `exception` - обработка ошибок (розовый)
- **Текстовое описание**: Формальное описание логики на русском языке
- **Ручной ввод**: Возможность редактировать JSON дескриптор функции перед анализом

### Использование

1. Откройте **Inspector**
2. Выберите любой AiItem (функцию, метод, процедуру)
3. Перейдите на вкладку **L2**
4. Нажмите кнопку **"Logic Architect"**
5. В открывшемся диалоге JSON редактор предзаполнен данными из `l0_code`
6. Нажмите **"Визуализировать"** для анализа
7. Граф логики отобразится справа, описание - внизу слева

### Поддерживаемые языки

- PL/pgSQL (хранимые процедуры PostgreSQL)
- JavaScript/TypeScript
- Python
- Другие языки с процедурной логикой

### Требования

- Переменная окружения `VITE_GEMINI_API_KEY` в `.env` файле
- Доступ к Gemini 3 Flash API

## 🌐 API Endpoints

Сервер предоставляет следующие REST API эндпоинты:

- `GET /api/health` - проверка состояния сервера
- `GET /api/items` - получение всех AiItem элементов
- `GET /api/items/:id` - получение конкретного AiItem
- `GET /api/stats` - статистика для Dashboard
- `GET /api/graph` - данные для Knowledge Graph
- `POST /api/chat` - RAG чат с Gemini AI
- `GET /api/files` - сканирование файловой системы
- `GET /api/logs` - логи сервера
- `GET /api/contract` - OpenAPI спецификация для интеграции

**📋 Backend API Contract**: Полная OpenAPI 3.0 спецификация всех endpoints доступна в `backend/api-contract.yaml`. Позволяет другим серверам интегрироваться с UI интерфейсом, соблюдая единый стандарт. Подробности в `backend/API-CONTRACT.md`.

## 📦 Использование как библиотеки

После сборки (`npm run build:lib`) проект можно использовать как npm пакет:

```tsx
import { 
  AiItemProvider, 
  Dashboard, 
  KnowledgeGraph,
  useAiItems 
} from '@aiitem/ui-components';

function MyApp() {
  return (
    <AiItemProvider baseUrl="http://your-api-server:3200">
      <Dashboard />
    </AiItemProvider>
  );
}
```

Подробная документация в `lib/README.md`.

## 🔌 Интеграция других Backend серверов

Система поддерживает подключение альтернативных backend серверов через **Backend API Contract**:

```bash
# Получить OpenAPI спецификацию
curl http://localhost:${PORT_DATA_SERVER:-3200}/api/contract

# Проверить соответствие контракту
curl http://localhost:${PORT_DATA_SERVER:-3200}/api/health
```

**Требования для совместимости:**
- Реализация обязательных endpoints (`/api/health`, `/api/items`, `/api/contract`)
- Соблюдение структуры ответов согласно OpenAPI схемам
- Поддержка стандартных форматов данных (AiItem, StandardResponse)

Подробное руководство по интеграции в `backend/API-CONTRACT.md`.

## 🚨 Устранение неполадок

### Сервер не запускается
```bash
# Проверьте правильность команды (не sarver.js!)
node server.js

# Убедитесь что порт свободен (замените 3200 на ваш PORT_DATA_SERVER)
netstat -an | findstr :3200
```

### Ошибки API
- Проверьте что сервер запущен на правильном порту
- Убедитесь что CORS настроен корректно
- Для чата установите переменную `API_KEY`
- Проверьте соответствие API контракту через `GET /api/contract`

### Logic Architect: "API Key missing"
Если при использовании Logic Architect появляется ошибка "API Key missing":
1. Убедитесь, что в `.env` файле есть переменная `VITE_GEMINI_API_KEY` (должна начинаться с `VITE_`)
2. Перезапустите dev-сервер Vite (переменные окружения загружаются только при старте)
3. Проверьте, что ключ корректный и имеет доступ к Gemini 3 Flash API

Пример `.env`:
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### Demo режим
Если API недоступно, компоненты покажут индикатор "Demo Mode" и будут использовать mock данные.

---

## 📝 Лицензия

MIT License