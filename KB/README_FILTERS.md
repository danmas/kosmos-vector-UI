# Система фильтрации в Kosmos Vector UI

## Обзор

Система фильтрации позволяет отфильтровать AI Items (узлы графа и элементы в Inspector) по трём критериям:
- **Тип элемента** (function, class, method, module, struct, interface, table, table_column)
- **Теги** (пользовательские метки, назначенные элементам)
- **Файл** (фильтрация по исходным файлам, в которых расположены элементы)

Фильтры работают **глобально** и синхронизированно между компонентами **Inspector** и **KnowledgeGraph (L1)**.

---

## Архитектура

### 1. Контекст фильтрации: `GraphFilterContext`

**Файл:** `lib/context/GraphFilterContext.tsx`

Центральный контекст для управления состоянием фильтров. Хранит:

#### Состояние фильтров по типам:
- `typeFilterEnabled: boolean` — включен ли фильтр по типам
- `selectedTypes: Set<string>` — множество выбранных типов
- `toggleType(type: string)` — переключить выбор типа
- `setAllTypes(types: string[])` — установить все типы сразу
- `setTypeFilterEnabled(enabled: boolean)` — включить/выключить фильтр

#### Состояние фильтров по тегам:
- `tagFilterEnabled: boolean` — включен ли фильтр по тегам
- `selectedTagCodes: Set<string>` — множество выбранных кодов тегов
- `toggleTag(tagCode: string)` — переключить выбор тега
- `setAllTags(tagCodes: string[])` — установить все теги сразу
- `setTagFilterEnabled(enabled: boolean)` — включить/выключить фильтр

#### Состояние фильтров по файлам:
- `fileFilterEnabled: boolean` — включен ли фильтр по файлам
- `selectedFilePaths: Set<string>` — множество выбранных путей файлов
- `toggleFile(filePath: string)` — переключить выбор файла
- `setAllFiles(filePaths: string[])` — установить все файлы сразу
- `setFileFilterEnabled(enabled: boolean)` — включить/выключить фильтр

#### Вспомогательные функции:
- `clearFilters()` — очистить все фильтры (вызывается при смене контекста)
- `isFilterDialogOpen: boolean` — состояние диалога фильтров
- `setIsFilterDialogOpen(open: boolean)` — открыть/закрыть диалог

**Важно:** Контекст также управляет поисковыми запросами (`graphSearch`, `inspectorSearch`) и историей фильтров, но это отдельная функциональность.

---

### 2. Диалог фильтрации: `FilterDialog`

**Файл:** `components/FilterDialog.tsx`

Модальное окно для настройки фильтров. Особенности:

#### UI структура:
```
┌─────────────────────────────────┐
│ [×] Фильтры                     │
├─────────────────────────────────┤
│ [✓] Учитывать тип         (5/8) │
│   [✓] Выбрать все               │
│   [✓] ƒ Функции                 │
│   [✓] C Классы                  │
│   [✓] M Методы                  │
│   [ ] ◈ Модули                  │
│   ...                           │
├─────────────────────────────────┤
│ [✓] Учитывать теги        (2/5) │
│   [~] Выбрать все               │
│   [✓] Important (IMP)           │
│   [✓] Refactor (REF)            │
│   [ ] Deprecated (DEP)          │
│   ...                           │
├─────────────────────────────────┤
│ [✓] Учитывать файл       (3/12) │
│   [🔍 Поиск по имени...]        │
│   [~] Выбрать все               │
│   [✓] 📄 users.sql              │
│        ./src/db/                │
│   [✓] 📄 auth.ts                │
│        ./src/services/          │
│   [ ] 📄 utils.ts               │
│        ./src/                   │
│   ...                           │
├─────────────────────────────────┤
│ Типы: 5 Теги: 2 Файлы: 3 [Готово] │
└─────────────────────────────────┘
```

#### Функции:
1. **Секция типов**:
   - Чекбокс "Учитывать тип" — включает/выключает фильтр
   - Master checkbox "Выбрать все" (поддерживает indeterminate state)
   - Список всех возможных типов с иконками
   - Подсветка типов, для которых есть данные в текущем контексте
   - Выбранные типы подсвечиваются cyan-цветом

2. **Секция тегов**:
   - Чекбокс "Учитывать теги" — включает/выключает фильтр
   - Master checkbox "Выбрать все"
   - Загрузка тегов через API (`GET /api/tags`)
   - Отображение названия тега, кода и описания (tooltip)
   - Выбранные теги подсвечиваются purple-цветом

3. **Секция файлов**:
   - Чекбокс "Учитывать файл" — включает/выключает фильтр
   - **Поиск по имени файла** — текстовое поле для фильтрации списка
   - Master checkbox "Выбрать все" (работает с отфильтрованным списком)
   - Список файлов с прокруткой (max-height: 160px)
   - Отображение: имя файла + путь к директории
   - Выбранные файлы подсвечиваются emerald-цветом
   - Источник данных: уникальные `filePath` из текущего `itemsList`

4. **Интерактивность**:
   - Перетаскивание окна (drag)
   - Изменение размера (resize handle в правом нижнем углу)
   - Позиция и размер сохраняются в состоянии компонента

#### Доступные типы:
```typescript
const ALL_TYPES = [
  { value: 'function', label: 'Функции', icon: 'ƒ' },
  { value: 'class', label: 'Классы', icon: 'C' },
  { value: 'method', label: 'Методы', icon: 'M' },
  { value: 'module', label: 'Модули', icon: '◈' },
  { value: 'interface', label: 'Интерфейсы', icon: 'I' },
  { value: 'struct', label: 'Структуры', icon: 'S' },
  { value: 'table', label: 'Таблицы', icon: '▤' },
  { value: 'table_column', label: 'Колонки таблиц', icon: '│' },
];
```

---

### 3. Применение фильтров в Inspector

**Файл:** `components/Inspector.tsx`

Inspector отображает список AI Items и применяет фильтры **последовательно**:

#### Порядок фильтрации (строки 354-394):
```typescript
const filteredItems = useMemo(() => {
  let items = itemsList;

  // 1. Фильтр по типам
  if (typeFilterEnabled && selectedTypes.size > 0) {
    items = items.filter(item => selectedTypes.has(item.type));
  }

  // 2. Фильтр по тегам
  if (tagFilterEnabled && selectedTagCodes.size > 0) {
    items = items.filter(item =>
      item.tags?.some(tag => selectedTagCodes.has(tag.code))
    );
  }

  // Фильтр по файлам
  if (fileFilterEnabled && selectedFilePaths.size > 0) {
    items = items.filter(item => selectedFilePaths.has(item.filePath));
  }

  // 3. Фильтр по поиску (regex или обычный)
  if (inspectorSearch.trim()) {
    // ... поиск по ID или filePath
  }

  return items;
}, [itemsList, inspectorSearch, typeFilterEnabled, selectedTypes, 
    tagFilterEnabled, selectedTagCodes, fileFilterEnabled, selectedFilePaths]);
```

#### Логика фильтрации по файлам:
- **Проверка**: Элемент проходит фильтр, если его `filePath` присутствует в `selectedFilePaths`
- **Формула**: `selectedFilePaths.has(item.filePath)`
- **Пример**: 
  - Выбраны файлы: `['./src/users.sql', './src/auth.ts']`
  - Элемент с `filePath='./src/users.sql'` → **проходит**
  - Элемент с `filePath='./src/utils.ts'` → **не проходит**

#### Логика фильтрации по тегам:
- **Проверка**: Элемент проходит фильтр, если **хотя бы один** из его тегов присутствует в `selectedTagCodes`
- **Формула**: `item.tags?.some(tag => selectedTagCodes.has(tag.code))`
- **Пример**: 
  - Выбраны теги: `[IMP, REF]`
  - Элемент с тегами `[IMP, OLD]` → **проходит** (есть IMP)
  - Элемент с тегами `[OLD, DEP]` → **не проходит** (нет пересечений)
  - Элемент без тегов → **не проходит**

#### Логика фильтрации по типам:
- **Проверка**: Элемент проходит фильтр, если его тип присутствует в `selectedTypes`
- **Формула**: `selectedTypes.has(item.type)`

#### Синхронизация с графом:
После фильтрации результаты публикуются в контекст для KnowledgeGraph (строки 398-426):
```typescript
useEffect(() => {
  const newIdsSet = new Set<string>(filteredItems.map(item => item.id));
  // Оптимизация: обновляем только если состав изменился
  setFilteredItemIds(newIdsSet);
}, [filteredItems, setFilteredItemIds]);
```

---

### 4. Применение фильтров в KnowledgeGraph

**Файл:** `components/KnowledgeGraph.tsx`

KnowledgeGraph применяет фильтры к узлам графа с **приоритетной логикой**:

#### Порядок проверки фильтров (строки 443-480):
```typescript
const filteredNodes = graphData.nodes.filter(node => {
  // 1. Сфокусированные узлы и их соседи - ВСЕГДА показываем
  if (alwaysShowIds.has(node.id)) return true;

  // 2. Если есть поиск в самом графе - он ГЛАВНЫЙ
  if (graphRegex) return graphRegex.test(node.id);

  // 3. Если есть явный фильтр filteredItemIds (Alt+клик)
  if (filteredItemIds.size > 0) return filteredItemIds.has(node.id);

  // 4. Если есть фильтр в Инспекторе
  if (inspectorSearch.trim()) {
    return inspectorRegex && inspectorRegex.test(node.id);
  }

  // 5. Фильтр по типам
  if (typeFilterEnabled && selectedTypes.size > 0) {
    if (!selectedTypes.has(node.type)) return false;
  }

  // 6. Фильтр по тегам
  if (tagFilterEnabled && selectedTagCodes.size > 0) {
    const nodeTags = itemTagsMap.get(node.id);
    if (!nodeTags || !Array.from(selectedTagCodes).some(code => nodeTags.has(code))) {
      return false;
    }
  }

  // 7. Если фильтров нет - показываем всё
  return true;
});
```

#### Особенности:

1. **Получение тегов для узлов** (строки 431-440):
   ```typescript
   // Создаём lookup-таблицу тегов из itemsList
   const itemsListData = getItemsList();
   const itemTagsMap = new Map<string, Set<string>>();
   if (itemsListData?.data) {
     for (const item of itemsListData.data) {
       if (item.tags && item.tags.length > 0) {
         itemTagsMap.set(item.id, new Set(item.tags.map(t => t.code)));
       }
     }
   }
   ```
   - Теги берутся из кэшированного списка `itemsList` (из DataCache)
   - Узлы графа **не содержат** поле `tags`, поэтому нужен lookup

2. **Логика фильтрации по тегам**:
   - Если у узла **нет тегов** → не проходит фильтр
   - Если **хотя бы один** тег узла есть в `selectedTagCodes` → проходит

3. **Приоритеты**:
   - Фокус (двойной клик) > Поиск в графе > Фильтр Alt+клик > Поиск в Inspector > Фильтры по типам/тегам/файлам
   - Если включены фильтры типов/тегов/файлов, они работают **совместно** (все должны пройти)

4. **Фильтрация связей**:
   После фильтрации узлов остаются только связи между отфильтрованными узлами:
   ```typescript
   const filteredLinks = graphData.links.filter(link => {
     const s = /* source id */;
     const t = /* target id */;
     return s && t && s !== t && filteredNodeIds.has(s) && filteredNodeIds.has(t);
   });
   ```

---

## Взаимодействие компонентов

```
┌─────────────────────────────────────────────────────────────┐
│                   GraphFilterContext                        │
│  typeFilterEnabled, selectedTypes, tagFilterEnabled, ...    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                 ┌────────────┴────────────┐
                 │                         │
         ┌───────▼──────┐          ┌──────▼──────────┐
         │ FilterDialog │          │                 │
         │ (настройка)  │          │                 │
         └──────────────┘          │                 │
                                   │                 │
         ┌─────────────────────────┤                 │
         │         Inspector       │                 │
         │  ┌─────────────────┐    │  KnowledgeGraph │
         │  │ filteredItems   │────┼────────────────▶│
         │  │ (list of items) │    │  filteredItemIds│
         │  └─────────────────┘    │                 │
         │         │               │                 │
         │         └──────────────▶│  finalFiltered  │
         │        setFilteredIds   │  GraphData      │
         └─────────────────────────┴─────────────────┘
```

### Последовательность работы:

1. **Пользователь открывает FilterDialog**:
   - Нажимает кнопку "Filter" в Inspector или KnowledgeGraph
   - `setIsFilterDialogOpen(true)`

2. **Пользователь настраивает фильтры**:
   - Включает `typeFilterEnabled` / `tagFilterEnabled`
   - Выбирает типы через `toggleType()` или `setAllTypes()`
   - Выбирает теги через `toggleTag()` или `setAllTags()`
   - Изменения сохраняются в `GraphFilterContext`

3. **Фильтры применяются в Inspector**:
   - `useMemo` пересчитывает `filteredItems`
   - Список в UI обновляется автоматически
   - Результаты публикуются в `setFilteredItemIds()`

4. **Фильтры применяются в KnowledgeGraph**:
   - `useMemo` пересчитывает `finalFilteredGraphData`
   - Использует и `filteredItemIds` из Inspector, и собственные фильтры
   - Граф перерисовывается с новыми узлами и связями

---

## API взаимодействие

### Загрузка тегов

**Endpoint:** `GET /api/tags`

**Используется в:** `FilterDialog.tsx` (строки 58-70)

```typescript
const loadTags = async () => {
  setLoading(true);
  try {
    const res = await apiClient.getTags();
    if (res.success) {
      setAllTagsData(res.tags || []);
    }
  } catch (err) {
    console.error('Failed to load tags:', err);
  } finally {
    setLoading(false);
  }
};
```

**Response:**
```json
{
  "success": true,
  "tags": [
    {
      "id": 1,
      "code": "IMP",
      "name": "Important",
      "description": "Критически важный элемент",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": null
    },
    ...
  ]
}
```

### Получение элементов с тегами

**Endpoint:** `GET /api/ai-items`

**Используется в:** `Inspector.tsx`, кэшируется в `DataCacheContext`

```typescript
interface AiItemSummary {
  id: string;
  type: AiItemType;
  language: string;
  filePath: string;
  tags?: TagSummary[];  // ← теги включены в список
  isVectorized?: boolean;
}
```

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": "myapp.users.get_user_by_id",
      "type": "function",
      "language": "sql",
      "filePath": "./src/users.sql",
      "tags": [
        { "id": 1, "code": "IMP", "name": "Important" },
        { "id": 5, "code": "REF", "name": "Refactor" }
      ],
      "isVectorized": true
    },
    ...
  ]
}
```

---

## Примеры использования

### Пример 1: Найти все функции с тегом "Important"

**Действия:**
1. Открыть FilterDialog (кнопка "Filter")
2. Включить "Учитывать тип"
3. Выбрать только "function"
4. Включить "Учитывать теги"
5. Выбрать только "Important (IMP)"
6. Закрыть диалог

**Результат:**
- В Inspector отобразятся только функции с тегом IMP
- В KnowledgeGraph отобразятся только узлы-функции с тегом IMP и связи между ними

### Пример 2: Показать все таблицы и их колонки

**Действия:**
1. Открыть FilterDialog
2. Включить "Учитывать тип"
3. Выбрать "table" и "table_column"
4. Закрыть диалог

**Результат:**
- Отображаются только таблицы и колонки
- Видны связи "reads_column", "updates_column" между функциями и колонками (если функции тоже выбраны)

### Пример 3: Исключить устаревший код

**Действия:**
1. Открыть FilterDialog
2. Включить "Учитывать теги"
3. Выбрать все теги **кроме** "Deprecated"
4. Закрыть диалог

**Результат:**
- Элементы с тегом "Deprecated" не отображаются
- Элементы без тегов тоже не отображаются (фильтр по тегам исключающий)

---

## Сброс фильтров

### Автоматический сброс

Фильтры автоматически сбрасываются при **смене контекста** (переключение проекта):

```typescript
// В GraphFilterContext
const clearFilters = useCallback(() => {
  setFilteredItemIds(new Set());
  setInspectorSearchState('');
  setGraphSearchState('');
  setTypeFilterEnabled(false);
  setSelectedTypes(new Set());
  setTagFilterEnabled(false);
  setSelectedTagCodes(new Set());
  setFileFilterEnabled(false);
  setSelectedFilePaths(new Set());
  // ...
}, []);
```

Вызывается в `DataCacheContext` при смене `currentContextCode`.

### Ручной сброс

Пользователь может:
1. **Отключить фильтры**: Убрать галочку "Учитывать тип" / "Учитывать теги"
2. **Снять все выборы**: Нажать Master checkbox "Выбрать все" (если всё было выбрано)
3. **Очистить поиск**: Очистить поле поиска в Inspector или KnowledgeGraph

---

## Технические детали

### Производительность

1. **Мемоизация фильтров**:
   - `filteredItems` в Inspector: `useMemo` с зависимостями
   - `finalFilteredGraphData` в KnowledgeGraph: `useMemo` с зависимостями
   - Пересчёт только при изменении фильтров или данных

2. **Оптимизация синхронизации**:
   - Inspector публикует `filteredItemIds` только при **реальном изменении** состава
   - Используется сравнение `Set` через `ref` (строки 398-426)

3. **Lookup-таблица тегов**:
   - В KnowledgeGraph создаётся `Map<id, Set<tagCode>>` для быстрого доступа
   - Строится один раз при пересчёте `finalFilteredGraphData`

### Состояние фильтров

**Хранится в памяти** (не персистентно):
- `typeFilterEnabled`, `selectedTypes`
- `tagFilterEnabled`, `selectedTagCodes`
- `fileFilterEnabled`, `selectedFilePaths`

**Хранится в localStorage**:
- `inspectorSearch`, `graphSearch` (поиск)
- `filterHistory` (история поисковых запросов)

При перезагрузке страницы фильтры **сбрасываются**, но поиск **восстанавливается**.

---

## Известные ограничения

1. **Теги загружаются только при открытии FilterDialog**:
   - Если теги изменились на бэкенде, нужно переоткрыть диалог
   - Решение: добавить кнопку "Обновить теги" или автоматическую перезагрузку

2. **Фильтр по тегам - логика OR**:
   - Элемент проходит, если есть **хотя бы один** выбранный тег
   - Нет возможности настроить логику AND (все выбранные теги)

3. **Узлы графа не содержат тег-информацию**:
   - Теги берутся из `itemsList` через lookup
   - Если элемент есть в графе, но нет в списке → фильтр по тегам не сработает

4. **Приоритеты фильтров в KnowledgeGraph**:
   - Фокус и поиск **переопределяют** фильтры по типам/тегам
   - Это может быть неочевидно для пользователя

---

## Будущие улучшения

1. **Персистентность фильтров**:
   - Сохранять состояние фильтров в localStorage
   - Восстанавливать при перезагрузке

2. **Режим AND для тегов**:
   - Добавить переключатель "Любой тег" / "Все теги"
   - Логика: `item.tags.every(tag => selectedTagCodes.has(tag.code))`

3. **Визуальная индикация**:
   - Показывать количество отфильтрованных элементов
   - Highlight активных фильтров в UI (уже частично реализовано)

4. **Предустановки фильтров**:
   - Сохранённые комбинации фильтров
   - Быстрое переключение между preset'ами

5. **Инвертированные фильтры**:
   - Показать всё **кроме** выбранных типов/тегов
   - Кнопка "Инвертировать выбор"

---

## Диаграмма потока данных

```
User Actions (FilterDialog)
        │
        ▼
GraphFilterContext
 ├─ typeFilterEnabled ────────┐
 ├─ selectedTypes ─────────────┤
 ├─ tagFilterEnabled ──────────┤
 └─ selectedTagCodes ──────────┤
        │                      │
        ├─────────────────┬────┤
        │                 │    │
        ▼                 ▼    ▼
    Inspector      KnowledgeGraph
        │                 │
        ├─ itemsList      ├─ graphData.nodes
        ├─ filter by type ├─ itemTagsMap (lookup)
        ├─ filter by tags ├─ filter by type
        ▼                 ├─ filter by tags
  filteredItems           ▼
        │           finalFilteredGraphData
        │                 │
        ├─────────────────┤
        ▼                 ▼
  setFilteredItemIds()
        │
        └──────▶ Sync between components
```

---

## Обновление v2.10.0: Динамические типы и кэширование

### Что изменилось

С версии 2.10.0 типы AI Items загружаются динамически через API вместо хардкода на фронтенде.

#### 1. API для управления типами

**Endpoints:**
- `GET /api/types` - получить все типы для контекста
- `POST /api/types` - создать кастомный тип
- `GET /api/types/{code}` - получить тип по коду
- `PUT /api/types/{code}` - обновить тип (name, description)
- `DELETE /api/types/{code}` - удалить кастомный тип
- `GET /api/types/{code}/items` - получить AI Items с данным типом

**Структура типа:**
```json
{
  "id": 1,
  "code": "function",
  "name": "Функция",
  "description": "SQL или программная функция",
  "is_system": true,
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": null
}
```

#### 2. UI для управления типами

**Расположение:** Settings → Item Types (вкладка 📦)

**Возможности:**
- ✅ Просмотр всех типов (системных и кастомных)
- ✅ Создание кастомных типов
- ✅ Редактирование названия и описания
- ✅ Удаление кастомных типов (системные защищены)

**Компонент:** [`components/settings/TypesConfigTab.tsx`](file:///c:/ERV/projects-ex/kosmos-vector-UI/components/settings/TypesConfigTab.tsx)

#### 3. Кэширование типов

Типы кэшируются в [`DataCacheContext`](file:///c:/ERV/projects-ex/kosmos-vector-UI/lib/context/DataCacheContext.tsx) аналогично графу и списку элементов:

```typescript
interface ContextCache {
  graph?: CacheEntry<GraphData>;
  itemsList?: CacheEntry<AiItemSummary[]>;
  itemTypes?: CacheEntry<ItemType[]>;  // ← Новое
}
```

**Методы кэша:**
- `getItemTypes()` - получить типы из кэша
- `setItemTypes(data, isDemo)` - сохранить типы в кэш

#### 4. Обновлённый FilterDialog

**Логика загрузки типов:**

1. **Проверка кэша**: Сначала проверяется `DataCacheContext`
2. **Загрузка с API**: Если кэш пуст → запрос `GET /api/types`
3. **Сохранение в кэш**: Результат сохраняется для повторного использования
4. **Graceful degradation**: При ошибке → откат на хардкод

**Код:**
```typescript
const loadTypes = async () => {
  // 1. Проверяем кэш
  const cached = getItemTypes();
  if (cached) {
    setApiTypes(cached.data);
    return;
  }
  
  // 2. Загружаем с API
  const res = await apiClient.getItemTypes();
  if (res.success) {
    setApiTypes(res.types);
    // 3. Сохраняем в кэш
    setItemTypes(res.types, false);
  }
};
```

### Преимущества

✅ **Динамичность**: Типы можно менять без релиза фронтенда  
✅ **Кастомизация**: Пользователь может создавать свои типы  
✅ **Производительность**: Кэширование минимизирует запросы к API  
✅ **Локализация**: Названия и описания хранятся в БД  
✅ **Обратная совместимость**: Fallback на хардкод при ошибках  

### Иконки типов

**Системные типы:**
- `function` → ƒ
- `class` → C
- `method` → M
- `module` → ◈
- `interface` → I
- `struct` → S
- `table` → ▤
- `table_column` → │

**Кастомные типы:**
- Все кастомные типы → ⚙

### Пример: Создание кастомного типа

1. Открыть **Settings** → **Item Types**
2. Нажать **"Создать тип"**
3. Заполнить:
   - **Код**: `api-endpoint` (уникален в рамках контекста)
   - **Название**: API Endpoint
   - **Описание**: REST API точка входа
4. Нажать **"Создать"**

После создания новый тип появится в FilterDialog и может использоваться для фильтрации.

### Пример: Фильтрация по кастомному типу

1. Открыть **Filter** (кнопка в Inspector или KnowledgeGraph)
2. Включить "Учитывать тип"
3. Выбрать созданный тип "API Endpoint"
4. В графе и списке останутся только элементы этого типа

### Обновление кэша

**Автоматически:**
- При создании/редактировании/удалении типа в TypesConfigTab
- При смене контекста (`currentContextCode`)

**Вручную:**
- Инвалидация кэша: `invalidate()` в DataCacheContext
- Повторное открытие FilterDialog загрузит свежие данные

### Миграция с хардкода

**До v2.10.0:**
```typescript
const ALL_TYPES = [
  { value: 'function', label: 'Функции', icon: 'ƒ' },
  // ... хардкод
];
```

**После v2.10.0:**
```typescript
// Загрузка из API
const res = await apiClient.getItemTypes();

// Fallback на хардкод при ошибке
const typesToDisplay = apiTypes.length > 0 
  ? apiTypes 
  : ALL_TYPES.map(t => ({ /* преобразование */ }));
```

### Технические детали

**Feature toggle:** `USE_TYPES_API = true` (включён по умолчанию)

**Структура кэша:**
- Изолирован по `context-code`
- TTL: до смены контекста или явной инвалидации
- Формат: `CacheEntry<ItemType[]>`

**Производительность:**
- Первая загрузка: ~100-300ms (API запрос)
- Повторные открытия: ~1-5ms (из кэша)
- Инвалидация: O(1)

---

## Заключение

Система фильтрации в Kosmos Vector UI обеспечивает:
- **Гибкость**: Динамические типы + теги + файлы, regex-поиск
- **Кастомизация**: Пользовательские типы через UI
- **Производительность**: Многоуровневое кэширование
- **Согласованность**: Синхронизация между компонентами
- **Расширяемость**: API для управления типами

Основные компоненты:
- `GraphFilterContext` — глобальное состояние фильтров
- `FilterDialog` — UI настройки (с динамической загрузкой типов, тегов, файлов)
- `TypesConfigTab` — CRUD для типов
- `DataCacheContext` — кэширование типов, графа, списка
- `Inspector` + `KnowledgeGraph` — применение фильтров

Фильтры работают **аддитивно** (AND между типами, тегами и файлами) и учитывают приоритеты других механизмов фильтрации (поиск, фокус).
