# Инкрементальное обновление графа D3

## Проблема

При клике на кнопки Callers/Callees в Tooltip:
1. Изменяется `filteredItemIds` -> пересчитывается `displayGraphData`
2. useEffect полностью очищает SVG (`selectAll("*").remove()`) и создаёт новую симуляцию
3. Все узлы получают новые случайные позиции, зелёная обводка теряется
4. Пользователь теряет ориентацию на графе

## Решение

Переход от полной перерисовки к инкрементальному обновлению с использованием D3 data join pattern (enter/update/exit).

---

## Шаг 1: Добавить refs для хранения состояния D3

**Файл:** `components/KnowledgeGraph.tsx` (~строка 71)

```typescript
// После svgRef
const simulationRef = useRef<d3.Simulation<any, any> | null>(null);
const nodePositionsRef = useRef<Map<string, {x: number, y: number}>>(new Map());
const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
const containerRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
const isInitializedRef = useRef(false);
```

---

## Шаг 2: Разделить useEffect на инициализацию и обновление

### 2.1 Новый useEffect для инициализации (один раз)

Создаёт структуру SVG, zoom, defs. Запускается только при монтировании.

**Расположение:** После текущего useEffect обновления обводки (~строка 907)

```typescript
// Инициализация SVG структуры (один раз)
useEffect(() => {
  if (!svgRef.current || isInitializedRef.current) return;
  
  const svg = d3.select(svgRef.current);
  const width = svgRef.current.clientWidth;
  const height = svgRef.current.clientHeight;
  
  svg.attr("viewBox", [0, 0, width, height]);
  
  // Background rect для pan
  svg.append("rect")
    .attr("class", "bg-rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "transparent")
    .style("cursor", "move")
    .on("dblclick", () => setFocusedNodeIds(new Set()));
  
  // Container для zoom transform
  containerRef.current = svg.append("g").attr("class", "graph-container");
  
  // Defs для стрелок
  svg.append("defs").append("marker")
    .attr("id", "arrowhead")
    // ... остальные атрибуты ...
  
  // Группы для связей и узлов
  containerRef.current.append("g").attr("class", "links-group");
  containerRef.current.append("g").attr("class", "link-labels-group");
  containerRef.current.append("g").attr("class", "nodes-group");
  
  // Zoom behavior
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      zoomTransformRef.current = event.transform;
      containerRef.current?.attr("transform", event.transform.toString());
    });
  svg.call(zoom);
  
  // Simulation (пустая)
  simulationRef.current = d3.forceSimulation([])
    .force("link", d3.forceLink([]).id((d: any) => d.id).distance(150))
    .force("charge", d3.forceManyBody().strength(-400).theta(0.9).distanceMax(300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(40))
    .alphaDecay(0.05)
    .alphaMin(0.001);
  
  isInitializedRef.current = true;
}, []);
```

### 2.2 Новый useEffect для обновления данных (инкрементально)

Использует D3 data join для добавления/удаления узлов без полной перерисовки.

```typescript
// Инкрементальное обновление данных графа
useEffect(() => {
  if (!isInitializedRef.current || !containerRef.current || !simulationRef.current || !displayGraphData) return;
  
  const simulation = simulationRef.current;
  const container = containerRef.current;
  const width = svgRef.current?.clientWidth || 800;
  const height = svgRef.current?.clientHeight || 600;
  
  // Подготовка узлов с сохранением позиций
  const nodes = displayGraphData.nodes.map(d => {
    const savedPos = nodePositionsRef.current.get(d.id);
    return {
      ...d,
      x: savedPos?.x ?? width / 2 + (Math.random() - 0.5) * 100,
      y: savedPos?.y ?? height / 2 + (Math.random() - 0.5) * 100
    };
  });
  
  const links = displayGraphData.links.map(d => ({ ...d }));
  
  // Обновление simulation
  simulation.nodes(nodes);
  (simulation.force("link") as d3.ForceLink<any, any>).links(links);
  
  // DATA JOIN для узлов
  const nodesGroup = container.select<SVGGElement>(".nodes-group");
  const nodeSelection = nodesGroup
    .selectAll<SVGGElement, any>("g.node")
    .data(nodes, (d: any) => d.id);
  
  // EXIT: удаляем уходящие узлы
  nodeSelection.exit()
    .transition().duration(300)
    .style("opacity", 0)
    .remove();
  
  // ENTER: добавляем новые узлы
  const nodeEnter = nodeSelection.enter()
    .append("g")
    .attr("class", "node")
    .style("opacity", 0)
    .call(d3.drag<any, any>()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended))
    .on("click", handleNodeClick)
    .on("dblclick", handleNodeDblClick)
    .on("mouseenter", handleNodeMouseEnter)
    .on("mouseleave", handleNodeMouseLeave);
  
  // Добавление форм для новых узлов
  nodeEnter.each(function(d: any) {
    const el = d3.select(this);
    // Создание circle/rect в зависимости от типа
    // ... код создания фигур ...
  });
  
  // Анимация появления новых узлов
  nodeEnter.transition().duration(300).style("opacity", 1);
  
  // UPDATE + ENTER: объединение для tick
  const nodeUpdate = nodeEnter.merge(nodeSelection);
  
  // DATA JOIN для связей (аналогично)
  // ...
  
  // Tick callback
  simulation.on("tick", () => {
    // Обновляем позиции
    nodeUpdate.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    // Сохраняем позиции в ref
    nodes.forEach(n => nodePositionsRef.current.set(n.id, { x: n.x, y: n.y }));
    // ... обновление связей ...
  });
  
  // Перезапуск симуляции с небольшим alpha
  simulation.alpha(0.3).restart();
  
}, [displayGraphData]);
```

---

## Шаг 3: Вынести обработчики событий в отдельные функции

**Расположение:** Перед useEffect инициализации (~строка 300)

Вынести из inline-кода:
- `handleNodeClick` - клик по узлу
- `handleNodeDblClick` - двойной клик
- `handleNodeMouseEnter` - наведение (для tooltip)
- `handleNodeMouseLeave` - уход курсора
- `dragstarted`, `dragged`, `dragended` - перетаскивание

Использовать `useCallback` для стабильных ссылок.

---

## Шаг 4: Удалить старый useEffect полной перерисовки

**Удалить:** Строки 909-1423 (старый useEffect с `selectAll("*").remove()`)

---

## Шаг 5: Обновить useEffect обводки

**Файл:** `components/KnowledgeGraph.tsx` (строки 873-907)

Убрать `displayGraphData` из зависимостей - теперь обводка обновляется через D3 selection по id узлов.

```typescript
useEffect(() => {
  if (!containerRef.current) return;
  
  const nodesGroup = containerRef.current.select(".nodes-group");
  nodesGroup.selectAll<SVGGElement, any>("g.node").each(function(d) {
    const shape = d3.select(this).select("rect, circle");
    const isTooltipNode = greenHighlightNodeId === d.id;
    const isMultiSelected = multiSelectedNodeIds.has(d.id);
    // ... логика определения цвета обводки ...
    shape.attr("stroke", strokeColor).attr("stroke-width", strokeWidth);
  });
}, [greenHighlightNodeId, clickHistory, multiSelectedNodeIds]);
```

---

## Ожидаемый результат

1. При клике на Callers/Callees узлы добавляются/удаляются **плавно**
2. Существующие узлы **сохраняют позиции**
3. Zoom/pan **сохраняется**
4. Зелёная обводка **не теряется**
5. Пользователь не теряет ориентацию на графе

---

## Риски и альтернативы

**Риск:** Большой рефакторинг (~400 строк изменений), возможны регрессии.

**Альтернатива (быстрое решение):** Сохранять позиции узлов в Map перед перерисовкой и восстанавливать после. Менее элегантно, но быстрее в реализации.