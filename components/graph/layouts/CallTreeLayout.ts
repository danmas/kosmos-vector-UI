/**
 * CallTreeLayout - Иерархическое дерево вызовов
 * Показывает граф как дерево от выбранного корневого узла
 * Поддерживает направления: top-down (callees), bottom-up (callers)
 */

import * as d3 from 'd3';
import {
  LayoutEngine,
  LayoutConfig,
  LayoutCallbacks,
  GraphNode,
  GraphLink,
  HierarchyNodeData,
} from '../types';
import {
  getNodeColor,
  NODE_SIZES,
  LINK_SETTINGS,
  TREE_SETTINGS,
  DEFAULT_STROKE,
  YELLOW_SHADES,
} from '../constants';
import {
  buildCallHierarchy,
  createCurvedLinkPath,
  getTimeStamp,
  getLinkSourceId,
  getLinkTargetId,
  getLinkType,
} from '../utils';

export class CallTreeLayout implements LayoutEngine {
  private container: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private width: number = 0;
  private height: number = 0;
  private treeLayout: d3.TreeLayout<HierarchyNodeData> | null = null;
  
  // Группы для элементов
  private linksGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private nodesGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private labelsGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;

  /** Инициализация layout'а */
  init(
    container: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number,
    height: number
  ): void {
    console.log(`[CallTreeLayout] [${getTimeStamp()}] Инициализация: ${width}x${height}`);
    
    this.container = container;
    this.width = width;
    this.height = height;

    // Очищаем контейнер
    container.selectAll('*').remove();

    // Создаём группы для элементов
    this.linksGroup = container.append('g').attr('class', 'tree-links');
    this.labelsGroup = container.append('g').attr('class', 'tree-labels');
    this.nodesGroup = container.append('g').attr('class', 'tree-nodes');

    // Создаём layout
    this.treeLayout = d3.tree<HierarchyNodeData>()
      .nodeSize([TREE_SETTINGS.NODE_SPACING, TREE_SETTINGS.LEVEL_HEIGHT]);
  }

  /** Обновление отображения */
  update(
    nodes: GraphNode[],
    links: GraphLink[],
    config: LayoutConfig,
    callbacks: LayoutCallbacks
  ): void {
    if (!this.container || !this.treeLayout || !this.linksGroup || !this.nodesGroup) {
      console.warn('[CallTreeLayout] Layout не инициализирован');
      return;
    }

    const { rootNodeId, treeDirection = 'top-down', maxDepth = 3, linkTypes } = config;
    // Дефолтные типы связей
    const effectiveLinkTypes = linkTypes && linkTypes.length > 0 ? linkTypes : ['calls', 'imports'];

    // Если нет корневого узла - показываем все узлы для выбора
    if (!rootNodeId) {
      console.log(`[CallTreeLayout] [Режим выбора root] Показываем ${nodes.length} узлов для выбора`);
      this.renderNodeSelectionMode(nodes, callbacks);
      return;
    }

    console.log(`[CallTreeLayout] [${getTimeStamp()}] Обновление: root=${rootNodeId}, direction=${treeDirection}, depth=${maxDepth}, linkTypes=${effectiveLinkTypes.join(',')}`);

    // Очищаем узлы режима выбора и placeholder
    this.nodesGroup?.selectAll('g.selection-node').remove();
    this.container?.selectAll('.placeholder').remove();

    // Строим иерархию
    const hierarchyData = buildCallHierarchy(
      rootNodeId,
      nodes,
      links,
      treeDirection as 'top-down' | 'bottom-up',
      maxDepth,
      effectiveLinkTypes
    );

    if (!hierarchyData) {
      this.showPlaceholder(`Узел "${rootNodeId}" не найден`);
      return;
    }

    // Создаём D3 hierarchy
    const hierarchyRoot = d3.hierarchy(hierarchyData);
    
    // Применяем layout (возвращает HierarchyPointNode)
    const root = this.treeLayout(hierarchyRoot);

    // Определяем ориентацию
    const isHorizontal = treeDirection === 'left-right' || treeDirection === 'right-left';
    const isReversed = treeDirection === 'bottom-up' || treeDirection === 'right-left';

    // Получаем узлы и связи (уже с координатами после layout)
    const treeNodes = root.descendants() as d3.HierarchyPointNode<HierarchyNodeData>[];
    const treeLinks = root.links() as d3.HierarchyPointLink<HierarchyNodeData>[];

    // Центрируем дерево
    const xExtent = d3.extent(treeNodes, d => isHorizontal ? d.y : d.x) as [number, number];
    const yExtent = d3.extent(treeNodes, d => isHorizontal ? d.x : d.y) as [number, number];
    
    const offsetX = this.width / 2 - (xExtent[0] + xExtent[1]) / 2;
    const offsetY = this.height / 2 - (yExtent[0] + yExtent[1]) / 2;

    // Применяем offset и ориентацию
    treeNodes.forEach(d => {
      if (isHorizontal) {
        const tempX = d.x;
        d.x = d.y! + offsetX;
        d.y = tempX + offsetY;
        if (isReversed) {
          d.x = this.width - d.x;
        }
      } else {
        d.x = d.x! + offsetX;
        d.y = d.y! + offsetY;
        if (isReversed) {
          d.y = this.height - d.y;
        }
      }
    });

    // Рисуем связи
    this.renderLinks(treeLinks, isHorizontal);

    // Рисуем узлы
    this.renderNodes(treeNodes, callbacks);
  }

  /** Отрисовка связей */
  private renderLinks(
    links: d3.HierarchyPointLink<HierarchyNodeData>[],
    isHorizontal: boolean
  ): void {
    if (!this.linksGroup) return;

    const linkSelection = this.linksGroup
      .selectAll<SVGPathElement, d3.HierarchyPointLink<HierarchyNodeData>>('path')
      .data(links, d => `${d.source.data.id}-${d.target.data.id}`);

    // EXIT
    linkSelection.exit()
      .transition()
      .duration(200)
      .style('opacity', 0)
      .remove();

    // ENTER
    const linkEnter = linkSelection.enter()
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', LINK_SETTINGS.STROKE_COLOR)
      .attr('stroke-width', LINK_SETTINGS.STROKE_WIDTH)
      .attr('stroke-opacity', 0)
      .attr('marker-end', 'url(#arrowhead)');

    // UPDATE + ENTER
    linkEnter.merge(linkSelection)
      .transition()
      .duration(300)
      .attr('stroke-opacity', LINK_SETTINGS.STROKE_OPACITY)
      .attr('d', d => {
        const source = { x: d.source.x!, y: d.source.y! };
        const target = { x: d.target.x!, y: d.target.y! };
        return createCurvedLinkPath(source, target, isHorizontal ? 'horizontal' : 'vertical');
      });
  }

  /** Отрисовка узлов */
  private renderNodes(
    nodes: d3.HierarchyPointNode<HierarchyNodeData>[],
    callbacks: LayoutCallbacks
  ): void {
    if (!this.nodesGroup) return;

    const nodeSelection = this.nodesGroup
      .selectAll<SVGGElement, d3.HierarchyPointNode<HierarchyNodeData>>('g.tree-node')
      .data(nodes, d => d.data.id);

    // EXIT
    nodeSelection.exit()
      .transition()
      .duration(200)
      .style('opacity', 0)
      .remove();

    // ENTER
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'tree-node')
      .style('cursor', 'pointer')
      .style('opacity', 0);

    // Добавляем форму узла
    nodeEnter.each(function(d) {
      const el = d3.select(this);
      const nodeData = d.data;
      const fillColor = getNodeColor(nodeData.type);

      // Для виртуальных узлов (если они есть)
      if (nodeData.isVirtual) {
        el.append('rect')
          .attr('width', 16)
          .attr('height', 16)
          .attr('x', -8)
          .attr('y', -8)
          .attr('rx', 3)
          .attr('fill', '#64748b')
          .attr('stroke', DEFAULT_STROKE)
          .attr('stroke-width', 1);
      } else {
        // Реальные узлы
        el.append('circle')
          .attr('r', NODE_SIZES.CIRCLE_RADIUS * 0.8) // Чуть меньше для дерева
          .attr('fill', fillColor)
          .attr('stroke', DEFAULT_STROKE)
          .attr('stroke-width', NODE_SIZES.STROKE_WIDTH_DEFAULT);
      }

      // Метка
      el.append('text')
        .text(nodeData.name)
        .attr('x', 20)
        .attr('y', 4)
        .attr('fill', '#cbd5e1')
        .attr('font-size', '11px')
        .style('pointer-events', 'none')
        .style('text-shadow', '1px 1px 2px #000');
    });

    // Привязываем события
    nodeEnter
      .on('click', (event, d) => {
        if (callbacks.onNodeClick) {
          callbacks.onNodeClick(event, d.data as unknown as GraphNode);
        }
      })
      .on('dblclick', (event, d) => {
        if (callbacks.onNodeDblClick) {
          callbacks.onNodeDblClick(event, d.data as unknown as GraphNode);
        }
      })
      .on('mouseenter', (event, d) => {
        if (callbacks.onNodeMouseEnter) {
          callbacks.onNodeMouseEnter(event, d.data as unknown as GraphNode);
        }
      })
      .on('mouseleave', (event, d) => {
        if (callbacks.onNodeMouseLeave) {
          callbacks.onNodeMouseLeave(event, d.data as unknown as GraphNode);
        }
      });

    // UPDATE + ENTER
    const nodeUpdate = nodeEnter.merge(nodeSelection);

    nodeUpdate
      .transition()
      .duration(300)
      .style('opacity', 1)
      .attr('transform', d => `translate(${d.x},${d.y})`);
  }

  /** Режим выбора root узла - показываем все узлы в виде сетки */
  private renderNodeSelectionMode(
    nodes: GraphNode[],
    callbacks: LayoutCallbacks
  ): void {
    if (!this.container || !this.nodesGroup || !this.linksGroup) return;

    // Очищаем
    this.linksGroup.selectAll('*').remove();
    this.labelsGroup?.selectAll('*').remove();
    this.container.selectAll('.placeholder').remove();

    // Показываем подсказку
    this.container.append('text')
      .attr('class', 'placeholder')
      .attr('x', this.width / 2)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '13px')
      .text('Двойной клик на узел для выбора корня дерева');

    // Располагаем узлы в сетке
    const padding = 60;
    const nodeRadius = 16;
    const spacing = 80;
    const cols = Math.floor((this.width - padding * 2) / spacing) || 1;

    const positionedNodes = nodes.map((node, i) => ({
      ...node,
      x: padding + (i % cols) * spacing + spacing / 2,
      y: padding + 40 + Math.floor(i / cols) * spacing,
    }));

    // Data join
    const nodeSelection = this.nodesGroup
      .selectAll<SVGGElement, typeof positionedNodes[0]>('g.selection-node')
      .data(positionedNodes, d => d.id);

    // EXIT
    nodeSelection.exit().remove();

    // ENTER
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'selection-node')
      .style('cursor', 'pointer')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // Форма узла
    nodeEnter.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', d => getNodeColor(d.type))
      .attr('stroke', DEFAULT_STROKE)
      .attr('stroke-width', 2);

    // Метка
    nodeEnter.append('text')
      .text(d => d.id.split('.').pop() || d.id)
      .attr('x', nodeRadius + 4)
      .attr('y', 4)
      .attr('fill', '#cbd5e1')
      .attr('font-size', '10px')
      .style('pointer-events', 'none');

    // События
    nodeEnter
      .on('click', (event, d) => {
        if (callbacks.onNodeClick) {
          callbacks.onNodeClick(event, d as GraphNode);
        }
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        if (callbacks.onNodeDblClick) {
          callbacks.onNodeDblClick(event, d as GraphNode);
        }
      })
      .on('mouseenter', (event, d) => {
        d3.select(event.currentTarget).select('circle')
          .attr('stroke', '#22c55e')
          .attr('stroke-width', 3);
        if (callbacks.onNodeMouseEnter) {
          callbacks.onNodeMouseEnter(event, d as GraphNode);
        }
      })
      .on('mouseleave', (event, d) => {
        d3.select(event.currentTarget).select('circle')
          .attr('stroke', DEFAULT_STROKE)
          .attr('stroke-width', 2);
        if (callbacks.onNodeMouseLeave) {
          callbacks.onNodeMouseLeave(event, d as GraphNode);
        }
      });

    // UPDATE
    nodeSelection
      .attr('transform', d => `translate(${d.x},${d.y})`);
  }

  /** Показать placeholder сообщение */
  private showPlaceholder(message: string): void {
    if (!this.container) return;

    // Очищаем все группы
    this.linksGroup?.selectAll('*').remove();
    this.nodesGroup?.selectAll('*').remove();
    this.labelsGroup?.selectAll('*').remove();

    // Показываем сообщение
    this.container.selectAll('.placeholder').remove();
    this.container.append('text')
      .attr('class', 'placeholder')
      .attr('x', this.width / 2)
      .attr('y', this.height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#64748b')
      .attr('font-size', '14px')
      .text(message);
  }

  /** Очистка ресурсов */
  destroy(): void {
    console.log(`[CallTreeLayout] [${getTimeStamp()}] Очистка ресурсов`);
    
    this.linksGroup?.remove();
    this.nodesGroup?.remove();
    this.labelsGroup?.remove();
    
    this.container = null;
    this.treeLayout = null;
    this.linksGroup = null;
    this.nodesGroup = null;
    this.labelsGroup = null;
  }

  /** Сброс позиций (для tree layout не требуется) */
  resetPositions(): void {
    // В tree layout позиции вычисляются автоматически
  }
}
