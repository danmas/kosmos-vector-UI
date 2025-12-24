# @aiitem/ui-components

Переиспользуемые React компоненты для проектов AiItem RAG архитектуры.

## Установка

```bash
npm install @aiitem/ui-components
```

## Зависимости

Убедитесь, что у вас установлены peer зависимости:

```bash
npm install react react-dom
```

Для функциональности чата и Logic Architect также установите:

```bash
npm install @google/genai lucide-react
```

## Быстрый старт

```tsx
import React from 'react';
import { 
  AiItemProvider, 
  Dashboard, 
  KnowledgeGraph, 
  Inspector,
  ChatInterface 
} from '@aiitem/ui-components';

function App() {
  return (
    <AiItemProvider baseUrl="http://localhost:3200">
      <div className="h-screen">
        <Dashboard />
        {/* или другие компоненты */}
      </div>
    </AiItemProvider>
  );
}
```

## Компоненты

### Dashboard
Показывает статистику проекта с графиками распределения по типам и языкам.

```tsx
import { Dashboard } from '@aiitem/ui-components';

<Dashboard />
```

### KnowledgeGraph
Интерактивный граф зависимостей с D3.js визуализацией.

```tsx
import { KnowledgeGraph } from '@aiitem/ui-components';

<KnowledgeGraph />
```

### Inspector
Детальный просмотрщик элементов кода с вкладками L0/L1/L2.

```tsx
import { Inspector } from '@aiitem/ui-components';

<Inspector />
```

### ChatInterface
RAG чат-бот для вопросов о кодовой базе.

```tsx
import { ChatInterface } from '@aiitem/ui-components';

<ChatInterface />
```

### LogicArchitectDialog
Диалог визуализации логики функций через граф потока управления.

```tsx
import { LogicArchitectDialog } from '@aiitem/ui-components';

<LogicArchitectDialog
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  item={selectedAiItem}
/>
```

### LogicVisualizer
Компонент визуализации графа логики с D3.js.

```tsx
import { LogicVisualizer } from '@aiitem/ui-components';

<LogicVisualizer 
  graph={logicGraph} 
  isLoading={isLoading} 
/>
```

## Провайдер контекста

### AiItemProvider

```tsx
import { AiItemProvider } from '@aiitem/ui-components';

<AiItemProvider 
  baseUrl="http://localhost:3200"  // URL вашего API
  demoMode={false}                 // Включить demo режим
>
  <YourComponents />
</AiItemProvider>
```

## Хуки

### useAiItems
Получение списка всех AiItem элементов:

```tsx
import { useAiItems } from '@aiitem/ui-components';

function MyComponent() {
  const { items, isLoading, error, isDemoMode, refetch } = useAiItems();
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      {isDemoMode && <div>Demo Mode Active</div>}
      {items.map(item => <div key={item.id}>{item.id}</div>)}
    </div>
  );
}
```

### useAiItemStats
Статистика для дашборда:

```tsx
import { useAiItemStats } from '@aiitem/ui-components';

function StatsComponent() {
  const { stats, isLoading, error } = useAiItemStats();
  
  return (
    <div>
      <h3>Total Items: {stats?.totalItems}</h3>
      <h3>Dependencies: {stats?.totalDeps}</h3>
    </div>
  );
}
```

### useAiItemGraph
Данные для графа зависимостей:

```tsx
import { useAiItemGraph } from '@aiitem/ui-components';

function GraphComponent() {
  const { graphData, isLoading } = useAiItemGraph();
  
  return (
    <div>
      Nodes: {graphData?.nodes.length}
      Links: {graphData?.links.length}
    </div>
  );
}
```

## API

Компоненты ожидают следующие API эндпоинты:

- `GET /api/items` - список всех AiItem
- `GET /api/items/:id` - конкретный AiItem  
- `GET /api/stats` - статистика для Dashboard
- `GET /api/graph` - данные для Knowledge Graph
- `POST /api/chat` - RAG чат

**Logic Architect** работает на клиентской стороне и использует Gemini 3 Flash API напрямую. Требуется переменная окружения `VITE_GEMINI_API_KEY`.

## Типы

Библиотека экспортирует все необходимые TypeScript типы:

```tsx
import { 
  AiItem, 
  AiItemType, 
  AppView, 
  ChatMessage,
  DashboardStats,
  GraphData,
  LogicGraph,
  LogicNode,
  LogicEdge,
  LogicAnalysisResponse,
  FunctionMetadata
} from '@aiitem/ui-components';
```

## Стилизация

Компоненты используют Tailwind CSS классы. Убедитесь, что Tailwind настроен в вашем проекте.

## Demo режим

При недоступности API компоненты автоматически используют mock данные:

```tsx
import { MOCK_AI_ITEMS, MOCK_FILE_TREE } from '@aiitem/ui-components';
```

## Лицензия

MIT
