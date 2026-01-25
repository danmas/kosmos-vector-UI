# UI Standard: Object List with Details Panel (Master-Detail)

Стандарт оформления интерфейса для отображения списков объектов с панелью деталей.

---

## Общая структура

```
+----------------------------------------------------------+
|                      HEADER (optional)                    |
+------------------+---------------------------------------+
|                  |                                       |
|   LEFT PANEL     |           RIGHT PANEL                 |
|   (List)         |           (Details)                   |
|                  |                                       |
|   - Search       |   - Header with badges                |
|   - Filters      |   - Meta info                         |
|   - Items list   |   - Tabs                              |
|                  |   - Content area                      |
|                  |                                       |
+------------------+---------------------------------------+
```

---

## Цветовая палитра

### Основные цвета фона (темная тема)

| Элемент                   | Tailwind класс          | Hex        |
|---------------------------|-------------------------|------------|
| Основной фон              | `bg-slate-900`          | #0f172a    |
| Фон левой панели          | `bg-slate-800/50`       | rgba       |
| Фон header                | `bg-slate-800`          | #1e293b    |
| Фон элементов списка      | `bg-slate-800` (hover)  | #1e293b    |
| Фон выбранного элемента   | `bg-blue-900/20`        | rgba       |
| Границы                   | `border-slate-700`      | #334155    |
| Подложка кода             | `bg-[#0d1117]`          | #0d1117    |

### Текст

| Назначение         | Tailwind класс   | Описание               |
|--------------------|------------------|------------------------|
| Заголовки          | `text-white`     | Основной текст         |
| Основной текст     | `text-slate-200` | ID, названия           |
| Вторичный текст    | `text-slate-400` | Мета-информация        |
| Приглушенный       | `text-slate-500` | Подсказки, placeholder |
| Моноширинный       | `font-mono`      | ID, пути, код          |

### Акцентные цвета (для badges и индикаторов)

```tsx
const ACCENT_COLORS = {
  // Типы объектов
  function: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
  method: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  module: 'bg-teal-500/20 text-teal-400 border-teal-500/50',
  interface: 'bg-pink-500/20 text-pink-400 border-pink-500/50',
  table: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50',
  
  // Статусы
  cached: 'bg-green-900/20 border-green-700/30 text-green-400',
  demo: 'bg-amber-900/20 border-amber-700/30 text-amber-400',
  error: 'bg-red-900/20 border-red-700/30 text-red-400',
  
  // Теги
  tag: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
};
```

---

## Левая панель (List Panel)

### Размеры

```tsx
// Ширина с возможностью ресайза
const MIN_WIDTH = 280;   // px
const DEFAULT_WIDTH = 320; // Tailwind: w-80
const MAX_WIDTH = 480;   // px
```

### Структура

```tsx
<div className="w-80 border-r border-slate-700 flex flex-col bg-slate-800/50">
  {/* Header секция */}
  <div className="p-2 border-b border-slate-700">
    {/* Заголовок с индикаторами статуса */}
    <div className="flex items-center justify-between mb-1">
      <h2 className="text-white font-bold">Data Inspector</h2>
      <div className="flex items-center gap-2">
        {/* Индикаторы: Demo, Cached, и т.д. */}
      </div>
    </div>
    
    {/* Кнопки действий */}
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        {/* Query, Filter, T+, T- и другие кнопки */}
      </div>
      
      {/* Поле поиска */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search ID or File... (/regex/)"
          className="w-full bg-slate-900 border border-slate-600 rounded py-1 px-2 text-sm text-white focus:border-blue-500 outline-none"
        />
      </div>
    </div>
  </div>
  
  {/* Прокручиваемый список */}
  <div className="flex-1 overflow-y-auto">
    {items.map(item => <ListItem key={item.id} item={item} />)}
  </div>
</div>
```

### Элемент списка (ListItem)

```tsx
interface ListItemProps {
  item: {
    id: string;
    type: string;
    language?: string;
    tags?: { id: string; name: string }[];
  };
  isSelected: boolean;
  onClick: () => void;
}

const ListItem: React.FC<ListItemProps> = ({ item, isSelected, onClick }) => (
  <div
    onClick={onClick}
    className={`
      p-1.5 border-b border-slate-700/50 cursor-pointer 
      hover:bg-slate-800 transition-colors
      ${isSelected 
        ? 'bg-blue-900/20 border-l-4 border-l-blue-500' 
        : 'border-l-4 border-l-transparent'
      }
    `}
  >
    {/* Первая строка: ID + язык */}
    <div className="flex justify-between items-start mb-0.5">
      <span className="text-slate-200 font-mono text-sm font-bold truncate" title={item.id}>
        {item.id}
      </span>
      <span className="text-[10px] uppercase text-slate-500">{item.language}</span>
    </div>
    
    {/* Вторая строка: badges */}
    <div className="flex items-center gap-1 flex-wrap">
      {/* Type badge */}
      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getBadgeColor(item.type)}`}>
        {item.type}
      </span>
      
      {/* Tags */}
      {item.tags?.map(tag => (
        <span
          key={tag.id}
          className="text-[9px] px-1 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded"
        >
          {tag.name}
        </span>
      ))}
      
      {/* Action button (example) */}
      <button
        onClick={(e) => { e.stopPropagation(); /* action */ }}
        className="text-[9px] bg-purple-600/80 hover:bg-purple-500 text-white px-1.5 py-0.5 rounded transition-colors font-bold ml-auto"
      >
        T
      </button>
    </div>
  </div>
);
```

### Состояния элемента списка

| Состояние | Классы |
|-----------|--------|
| Default   | `border-l-4 border-l-transparent` |
| Hover     | `hover:bg-slate-800` |
| Selected  | `bg-blue-900/20 border-l-4 border-l-blue-500` |

---

## Правая панель (Details Panel)

### Структура

```tsx
<div className="flex-1 flex flex-col overflow-hidden">
  {/* Header */}
  <div className="p-3 border-b border-slate-700 bg-slate-800">
    <div className="flex justify-between items-start">
      <div className="flex-1">
        {/* Первая строка: ID + Type badge + Action buttons */}
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-lg font-bold text-white font-mono">{item.id}</h1>
          <span className={`text-xs px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider ${getBadgeColor(item.type)}`}>
            {item.type}
          </span>
          <button className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white px-2 py-0.5 rounded transition-colors font-bold">
            EC
          </button>
        </div>
        
        {/* Мета-информация */}
        <div className="flex gap-3 text-xs text-slate-400 mb-2">
          <span className="flex items-center gap-1">📄 {item.filePath}</span>
          <span className="flex items-center gap-1">🌐 {item.language}</span>
        </div>
        
        {/* Теги */}
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/50 rounded text-[10px] font-mono"
            >
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  </div>

  {/* Tabs */}
  <div className="flex border-b border-slate-700 bg-slate-800/50">
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className={`px-3 py-1.5 text-xs font-bold transition-colors ${
          activeTab === tab.id
            ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-900/10'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>

  {/* Tab Content */}
  <div className="flex-1 overflow-y-auto p-2 bg-slate-900">
    {/* Контент активной вкладки */}
  </div>
</div>
```

### Рекомендуемые вкладки (примеры)

| Tab ID | Label            | Содержимое                          |
|--------|------------------|-------------------------------------|
| source | Source Code      | Подсветка синтаксиса кода           |
| links  | Connectivity     | Связи: Dependencies / Used By       |
| meta   | Metadata         | JSON/таблица с мета-информацией     |
| ai     | AI Analysis      | Семантический анализ, embeddings    |

### Пример вкладки со списком связей

```tsx
<div className="grid grid-cols-2 gap-2 h-full">
  {/* Dependencies (Outgoing) */}
  <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
    <h3 className="text-purple-400 font-bold mb-2 flex items-center gap-1.5 text-sm shrink-0">
      Dependencies 
      <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">
        {outgoing.length}
      </span>
    </h3>
    <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
      {outgoing.map(link => (
        <div 
          key={link.target}
          onClick={() => onSelect(link.target)}
          className="p-1.5 bg-slate-800 rounded border border-slate-700 text-xs hover:border-blue-500 cursor-pointer"
        >
          <div className="flex justify-between items-center gap-2">
            <span className="text-slate-300 font-mono break-all">{link.target}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-blue-500/20 text-blue-300 border-blue-500/30">
              {link.type}
            </span>
          </div>
        </div>
      ))}
    </div>
  </div>

  {/* Used By (Incoming) */}
  <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
    <h3 className="text-emerald-400 font-bold mb-2 flex items-center gap-1.5 text-sm shrink-0">
      Used By 
      <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">
        {incoming.length}
      </span>
    </h3>
    <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
      {/* ... аналогично */}
    </div>
  </div>
</div>
```

---

## Диалоговые окна (Modals)

### Характеристики

- **Позиционирование**: `fixed`, с поддержкой перетаскивания (drag)
- **Ресайз**: Поддержка изменения размера
- **z-index**: `z-[100]` и выше
- **Фон**: `bg-slate-900/95` с `ring-1 ring-white/10`
- **Закрытие**: Кнопка X в header, ESC (опционально)

### Базовая структура

```tsx
interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ isOpen, onClose, title, children }) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 450, y: 64 });
  const [size, setSize] = useState({ width: 420, height: 550 });

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-[100] flex flex-col pointer-events-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`
      }}
    >
      <div className="bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden pointer-events-auto ring-1 ring-white/10 h-full relative">
        {/* Header (Drag Handle) */}
        <div
          onMouseDown={onMouseDownDrag}
          className="px-3 py-2 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center cursor-move select-none"
        >
          <div className="flex items-center gap-2">
            <div className="bg-cyan-500/20 p-1 rounded">
              {/* Icon */}
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide">{title}</h2>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {children}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-700 bg-slate-800/50 flex justify-between items-center shrink-0">
          <div className="text-[9px] text-slate-500">
            {/* Status info */}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors"
            >
              Сохранить
            </button>
          </div>
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={onMouseDownResize}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-[101] flex items-end justify-end p-0.5"
        >
          <svg className="w-2 h-2 text-slate-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 22h-2v-2h2v2zM22 18h-2v-2h2v2zM18 22h-2v-2h2v2zM18 18h-2v-2h2v2zM14 22h-2v-2h2v2zM22 14h-2v-2h2v2z" />
          </svg>
        </div>
      </div>
    </div>
  );
};
```

### Секции внутри диалога

```tsx
{/* Секция с toggle-заголовком */}
<div className="border border-slate-700 rounded-lg overflow-hidden">
  <div className="bg-slate-800/60 px-3 py-2 flex items-center justify-between">
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
      />
      <span className="text-xs font-bold text-slate-200">Название секции</span>
    </label>
    <span className="text-[10px] text-slate-500">{selected}/{total}</span>
  </div>
  
  {enabled && (
    <div className="p-2 space-y-1 bg-slate-900/50">
      {/* Содержимое секции */}
    </div>
  )}
</div>
```

---

## Кнопки

### Стили кнопок

```tsx
// Primary action
<button className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded transition-colors">
  Action
</button>

// Secondary
<button className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold px-3 py-1 rounded transition-colors">
  Cancel
</button>

// Success
<button className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1 rounded transition-colors">
  Save
</button>

// Danger
<button className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1 rounded transition-colors">
  Delete
</button>

// Disabled
<button disabled className="bg-slate-700 text-slate-500 text-xs font-bold px-3 py-1 rounded cursor-not-allowed">
  Disabled
</button>

// Compact (для inline actions)
<button className="text-[9px] bg-purple-600/80 hover:bg-purple-500 text-white px-1.5 py-0.5 rounded transition-colors font-bold">
  T
</button>
```

---

## Поиск с историей

```tsx
const SearchWithHistory: React.FC = () => {
  const [search, setSearch] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const historyRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search ID or File... (/regex/)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setShowHistory(true)}
        className="w-full bg-slate-900 border border-slate-600 rounded py-1 px-2 text-sm text-white focus:border-blue-500 outline-none pr-8"
      />
      
      {history.length > 0 && (
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="absolute right-1.5 top-1 text-slate-500 hover:text-white"
        >
          <svg className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`}>
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {showHistory && history.length > 0 && (
        <div
          ref={historyRef}
          className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-2xl z-50 max-h-60 overflow-y-auto"
        >
          <div className="px-2 py-1 border-b border-slate-700 flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Recent Filters</span>
            <button className="text-[9px] text-red-400 hover:text-red-300">Clear</button>
          </div>
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => { setSearch(h); setShowHistory(false); }}
              className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white border-b border-slate-700/50 last:border-0 truncate font-mono"
            >
              {h}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
```

---

## Индикаторы статуса

```tsx
// Cached (зеленый)
<span className="bg-green-900/20 border border-green-700/30 text-green-400 text-xs px-2 py-1 rounded flex items-center gap-1">
  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
  Cached
</span>

// Demo mode (amber, с анимацией)
<span className="bg-amber-900/20 border border-amber-700/30 text-amber-400 text-xs px-2 py-1 rounded flex items-center gap-1">
  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
  Demo
</span>

// Loading
<span className="text-slate-400 text-xs flex items-center gap-2">
  <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-400"></div>
  Loading...
</span>
```

---

## Типографика

| Элемент               | Классы                                      |
|-----------------------|---------------------------------------------|
| Заголовок панели      | `text-white font-bold`                      |
| ID объекта (крупный)  | `text-lg font-bold text-white font-mono`    |
| ID в списке           | `text-sm font-bold text-slate-200 font-mono`|
| Мета-информация       | `text-xs text-slate-400`                    |
| Badge текст           | `text-[10px] font-bold uppercase`           |
| Теги                  | `text-[9px] font-mono` или `text-[10px]`    |
| Подсказки             | `text-[9px] text-slate-500 italic`          |

---

## Spacing guidelines

| Контекст             | Padding/Gap       |
|----------------------|-------------------|
| Панель header        | `p-2` или `p-3`   |
| Элемент списка       | `p-1.5`           |
| Между кнопками       | `gap-1.5`         |
| Между секциями       | `gap-2` или `gap-4` |
| Внутри диалога       | `p-3`             |
| Tab кнопки           | `px-3 py-1.5`     |

---

## Пример минимальной реализации

```tsx
import React, { useState } from 'react';

interface Item {
  id: string;
  type: string;
  language?: string;
}

const ObjectListView: React.FC<{ items: Item[] }> = ({ items }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = items.filter(item => 
    item.id.toLowerCase().includes(search.toLowerCase())
  );

  const selected = items.find(i => i.id === selectedId);

  return (
    <div className="flex h-full bg-slate-900">
      {/* Left Panel */}
      <div className="w-80 border-r border-slate-700 flex flex-col bg-slate-800/50">
        <div className="p-2 border-b border-slate-700">
          <h2 className="text-white font-bold mb-2">Objects</h2>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded py-1 px-2 text-sm text-white focus:border-blue-500 outline-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`p-1.5 border-b border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors ${
                selectedId === item.id 
                  ? 'bg-blue-900/20 border-l-4 border-l-blue-500' 
                  : 'border-l-4 border-l-transparent'
              }`}
            >
              <span className="text-slate-200 font-mono text-sm font-bold">{item.id}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="p-3 border-b border-slate-700 bg-slate-800">
              <h1 className="text-lg font-bold text-white font-mono">{selected.id}</h1>
            </div>
            <div className="flex-1 overflow-y-auto p-2 bg-slate-900">
              {/* Content */}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Select an item to view details
          </div>
        )}
      </div>
    </div>
  );
};

export default ObjectListView;
```

---

## Чеклист при реализации

- [ ] Левая панель с фиксированной/ресайзабельной шириной
- [ ] Поле поиска с поддержкой regex (`/pattern/flags`)
- [ ] Кнопки фильтров и действий в header
- [ ] Элементы списка с состояниями hover/selected
- [ ] Type badges с цветовым кодированием
- [ ] Правая панель с header, мета-инфо, табами
- [ ] Диалоги с drag & resize
- [ ] Темная цветовая схема на основе slate
- [ ] Моноширинный шрифт для ID и путей
- [ ] Индикаторы загрузки и статусов
