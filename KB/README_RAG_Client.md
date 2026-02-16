# Раздел RAG Client (Чат-ассистент)

## Обзор
RAG Client — это интерактивный чат-интерфейс для общения с AI-ассистентом о кодовой базе. Использует Retrieval-Augmented Generation (RAG) для предоставления контекстно-осведомлённых ответов на основе проанализированного кода.

## Расположение в UI
- **Иконка**: 💬
- **Название**: RAG Client
- **Позиция**: Шестой элемент в левой панели

## Компонент
- **Файл**: `components/ChatInterface.tsx`
- **Размер**: 313 строк кода
- **Тип**: React функциональный компонент
- **AI Model**: Google Gemini (настраивается на бэкенде)

## Структура интерфейса

### Заголовок
- **Название**: "RAG Assistant"
- **Описание**: "Ask questions about your codebase using natural language"
- **Demo Mode индикатор**: Янтарный бейдж при недоступности бэкенда
  - "Chat may be unavailable" предупреждение

### Область сообщений (Messages Area)

#### Визуализация сообщений
- **User messages** (справа):
  - Голубой фон (#bg-blue-600)
  - Белый текст
  - Закруглённые углы (rounded-2xl)
  - Максимальная ширина: 3xl
  
- **Model messages** (слева):
  - Тёмно-серый фон (#bg-slate-800)
  - Светло-серый текст (#text-slate-200)
  - Граница slate-700
  - Максимальная ширина: 3xl

#### Индикатор загрузки
- **3 прыгающие точки** с задержкой анимации
- Цвет: slate-500
- Текст: "Analyzing codebase..."

#### Retrieved Context (Использованный контекст)
Под ответом модели отображается:
- **Заголовок**: "📚 Context used (X items)"
- **Список элементов**:
  - ID элемента (моноширинный шрифт)
  - Тип и язык (в скобках)
  - Фон: slate-900/50
  - Граница: slate-600

### Область ввода (Input Area)

#### Текстовое поле
- **Placeholder**: "Ask about your codebase..."
- **Стиль**: Закруглённое (rounded-xl)
- **Фон**: slate-900
- **Граница**: slate-600 → blue-500 при фокусе
- **Disabled**: При загрузке или demo mode

#### Кнопки управления

##### Clear History (Очистить историю)
- **Позиция**: Слева от кнопок
- **Подтверждение**: confirm() диалог
- **Действие**: Очищает все сообщения, оставляет welcome message
- **Цвет**: slate-500 → red-400 при hover

##### RAG Button (Тест RAG)
- **Цвет**: Фиолетовый (purple-600)
- **Иконка**: 💡 (лампочка)
- **Открывает**: RAGTestDialog
- **Назначение**: Тестирование извлечения контекста без генерации ответа

##### Send Button (Отправить)
- **Цвет**: Синий (blue-600)
- **Текст**: "Send" или "Thinking..." при загрузке
- **Индикатор**: Крутящийся спиннер при загрузке
- **Disabled**: При пустом input или загрузке

## Функциональность

### Отправка сообщений

#### Обработка запроса
1. Создание `userMsg` с timestamp
2. Добавление в историю
3. Очистка input
4. Отправка на бэкенд: `apiClient.chat(input)`
5. Получение ответа с `usedContextIds`
6. Создание `modelMsg` с retrieved context
7. Добавление в историю

#### Структура ChatMessage
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  retrievedContext?: AiItem[];
}
```

### Сохранение истории (localStorage)

#### Ключ хранения
`rag_assistant_history_{contextCode}`
- **Изоляция**: Каждый context имеет свою историю
- **Автосохранение**: При любом изменении `messages`
- **Загрузка**: При монтировании компонента

#### Welcome Message
По умолчанию (при первой загрузке):
```
Hello! I am the AiItem RAG Client for project {contextCode}. 
I have analyzed your codebase. Ask me anything about the 
architecture, functions, or logic.
```

### Обработка ошибок

#### Типы ошибок
1. **API_KEY не настроен**:
   - "API Key is not configured. Please set the API_KEY environment variable on the server."
   
2. **Gemini SDK не установлен**:
   - "Gemini SDK is not installed on the server. Please run: npm install @google/genai"
   
3. **Demo mode**:
   - "Chat is not available in demo mode. Please start the backend server."

#### Визуализация ошибок
- Красная рамка вокруг сообщения об ошибке
- Сообщение от модели с объяснением проблемы

### Автопрокрутка
- **useEffect** отслеживает изменения `messages`
- **scrollIntoView** с `behavior: 'smooth'`
- **Ref**: `messagesEndRef` в конце списка

## Диалоги и REST API маршруты

Раздел RAG Client вызывает один основной диалог и использует REST API для чата и RAG.

### 1. RAGTestDialog (`components/RAGTestDialog.tsx`)

**Вызов**: Кнопка 💡 (RAG Button) слева от кнопки Send.

**Назначение**: Тестирование извлечения контекста без генерации ответа. Проверка работы RAG-поиска с разными стратегиями, возможность отправить результат в основной чат.

| Маршрут | Метод | Описание |
|---------|-------|----------|
| `/api/rag/retrieve` | POST | Получение структурированного контекста без LLM. Body: `{ query, contextCode, strategy, maxChunks, includeRelations, formatting, itemFilter? }` |
| `/api/chat` | POST | Отправка сообщения с RAG-контекстом в чат. Body: `{ message: string }` (вопрос + контекст) |

**Стратегии** (strategy): `semantic`, `keyword`, `hybrid`, `hierarchical` (и др., см. `/api/rag/strategies`).

**Фильтрация**: RAGTestDialog открывает FilterDialog (кнопка Filter) — используется `GET /api/types`, `GET /api/tags` для фильтра по типам и тегам при RAG retrieve.

**Интеграция с Chat**: Custom Event `add-rag-chat-messages` с payload `{ userMsg, modelMsg }` — добавляет результат в историю основного чата.

---

### 2. Основной чат (ChatInterface)

**REST API**:

| Маршрут | Метод | Описание |
|---------|-------|----------|
| `/api/chat` | POST | Отправка запроса. Body: `{ message: string }`. Response: `{ response, usedContextIds }` |
| `/api/items` | GET | Загрузка AiItems (через DataCache) для отображения retrieved context по usedContextIds |

### Устаревшая информация
Ранее использовался `POST /api/rag/search` — в актуальной версии используется `POST /api/rag/retrieve` с расширенным набором параметров.

## Context Code Support

### Изоляция по контекстам
- **История чата**: Отдельная для каждого context
- **Загрузка AiItems**: Из соответствующего контекста
- **localStorage ключи**: Уникальные для каждого context

### Переключение контекстов
- **Автоматическая смена**: При изменении `currentContextCode`
- **Новая история**: Загружается история нового контекста
- **Очистка**: Предыдущая история сохраняется

## Загрузка контекста кода

### При монтировании
1. Загрузка `items` через `getItemsWithFallback()`
2. Проверка demo mode
3. Использование для retrieved context

### Состояние загрузки
```typescript
const [items, setItems] = useState<AiItem[]>([]);
const [itemsLoading, setItemsLoading] = useState(true);
const [itemsError, setItemsError] = useState<string | null>(null);
```

### Экраны состояний
- **Loading**: "Loading context data..."
- **Error**: Красная рамка с сообщением об ошибке
- **Loaded**: Нормальный интерфейс чата

## Стилизация

### Цветовая схема
- **Фон приложения**: slate-900
- **User messages**: blue-600
- **Model messages**: slate-800
- **Границы**: slate-700
- **Input**: slate-900 с slate-600 границей

### Адаптивность
- **Максимальная ширина сообщений**: 3xl (48rem)
- **Отступы сообщений**: ml-8 для user, mr-8 для model
- **Закруглённые углы**: rounded-2xl для сообщений

### Анимации
- **Прыгающие точки**: 3 точки с задержкой 0.1s, 0.2s
- **Smooth scroll**: При добавлении новых сообщений
- **Fade-in**: Для новых сообщений

## Пример использования

### Типичные запросы
- "What does the AuthService class do?"
- "Find all functions that interact with the database"
- "Explain the user authentication flow"
- "What are the main dependencies of UserController?"
- "Show me all API endpoints for user management"

### Ожидаемые ответы
- **Текстовое объяснение** на естественном языке
- **Retrieved Context** — список использованных AiItems
- **Точность**: Зависит от качества L2 описаний и векторизации

## Технические детали

### Хуки
```typescript
const { currentContextCode } = useDataCache();
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [input, setInput] = useState('');
const [isLoading, setIsLoading] = useState(false);
```

### Event Listeners
```typescript
window.addEventListener('add-rag-chat-messages', handleExternalMessage);
```

### localStorage
```typescript
const storageKey = `${CHAT_STORAGE_KEY_BASE}_${currentContextCode}`;
localStorage.setItem(storageKey, JSON.stringify(messages));
```

## Ограничения Demo Mode
- **Chat недоступен**: Backend API не отвечает
- **Только просмотр**: Можно видеть интерфейс, но нельзя отправлять
- **Warning**: Отображается янтарный бейдж "Chat may be unavailable"

## Будущие улучшения
- Потоковая передача ответов (SSE)
- Markdown поддержка в сообщениях
- Code highlighting в ответах
- История сессий (сохранение нескольких чатов)
- Экспорт истории чата
