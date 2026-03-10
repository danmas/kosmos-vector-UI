/**
 * ProjectTreeLayout - Дерево по структуре проекта
 * Группирует узлы по файловой структуре или пакетам
 * Поддерживает сворачивание/разворачивание веток
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
  VIRTUAL_NODE_COLORS,
} from '../constants';
import {
  buildPathHierarchy,
  getTimeStamp,
} from '../utils';

export class ProjectTreeLayout implements LayoutEngine {
  private container: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private width: number = 0;
  private height: number = 0;
  private treeLayout: d3.TreeLayout<HierarchyNodeData> | null = null;
  
  // Группы для элементов
  private linksGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private nodesGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  
  // Состояние свёрнутых узлов
  private collapsedNodes: Set<string> = new Set();
  
  // Callback для обновления при сворачивании
  private updateCallback: (() => void) | null = null;

  /** Инициализация layout'а */
  init(
    container: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number,
    height: number
  ): void {
    console.log(`[ProjectTreeLayout] [${getTimeStamp()}] Инициализация: ${width}x${height}`);
    
    this.container = container;
    this.width = width;
    this.height = height;

    // Очищаем контейнер
    container.selectAll('*').remove();

    // Создаём группы для элементов
    this.linksGroup = container.append('g').attr('class', 'project-tree-links');
    this.nodesGroup = container.append('g').attr('class', 'project-tree-nodes');

    // Создаём layout (горизонтальное дерево)
    this.treeLayout = d3.tree<HierarchyNodeData>()
      .nodeSize([24, 180]); // Высота узла 24px, отступ 180px между уровнями
  }

  /** Обновление отображения */
  update(
    nodes: GraphNode[],
    links: GraphLink[],
    config: LayoutConfig,
    callbacks: LayoutCallbacks
  ): void {
    if (!this.container || !this.treeLayout || !this.linksGroup || !this.nodesGroup) {
      console.warn('[ProjectTreeLayout] Layout не инициализирован');
      return;
    }

    const { groupBy = 'file', collapsedNodes } = config;

    // Синхронизируем collapsed state из конфига
    if (collapsedNodes) {
      this.collapsedNodes = new Set(collapsedNodes);
    }

    console.log(`[ProjectTreeLayout] [${getTimeStamp()}] Обновление: ${nodes.length} узлов, groupBy=${groupBy}`);

    if (nodes.length === 0) {
      this.showPlaceholder('Нет данных для отображения');
      return;
    }

    // Строим иерархию в зависимости от группировки
    let hierarchyData: HierarchyNodeData;
    
    if (groupBy === 'file') {
      hierarchyData = buildPathHierarchy(nodes, 'filePath', '/');
    } else if (groupBy === 'package') {
      hierarchyData = buildPathHierarchy(nodes, 'id', '.');
    } else {
      // Группировка по типу
      hierarchyData = this.buildTypeHierarchy(nodes);
    }

    // Применяем collapsed state
    this.applyCollapsedState(hierarchyData);

    // Создаём D3 hierarchy
    const hierarchyRoot = d3.hierarchy(hierarchyData);
    
    // Применяем layout
    const root = this.treeLayout(hierarchyRoot);

    // Получаем узлы и связи
    const treeNodes = root.descendants() as d3.HierarchyPointNode<HierarchyNodeData>[];
    const treeLinks = root.links() as d3.HierarchyPointLink<HierarchyNodeData>[];

    // Центрируем дерево (горизонтальное)
    const yExtent = d3.extent(treeNodes, d => d.x) as [number, number];
    const offsetY = this.height / 2 - (yExtent[0] + yExtent[1]) / 2;
    const offsetX = TREE_SETTINGS.PADDING;

    // Применяем offset (x и y меняются местами для горизонтального дерева)
    treeNodes.forEach(d => {
      const tempX = d.x;
      d.x = d.y! + offsetX;
      d.y = tempX + offsetY;
    });

    // Сохраняем callback для обновления
    this.updateCallback = () => this.update(nodes, links, config, callbacks);

    // Рисуем связи
    this.renderLinks(treeLinks);

    // Рисуем узлы
    this.renderNodes(treeNodes, callbacks);
  }

  /** Построить иерархию по типам */
  private buildTypeHierarchy(nodes: GraphNode[]): HierarchyNodeData {
    const root: HierarchyNodeData = {
      id: 'root',
      name: 'Project',
      type: 'root',
      isVirtual: true,
      children: [],
    };

    // Группируем по типам
    const typeGroups = new Map<string, GraphNode[]>();
    
    for (const node of nodes) {
      const type = node.type || 'unknown';
      if (!typeGroups.has(type)) {
        typeGroups.set(type, []);
      }
      typeGroups.get(type)!.push(node);
    }

    // Создаём узлы для каждого типа
    Array.from(typeGroups.entries()).forEach(([type, typeNodes]) => {
      const typeNode: HierarchyNodeData = {
        id: `type-${type}`,
        name: type.charAt(0).toUpperCase() + type.slice(1),
        type: 'type-group',
        isVirtual: true,
        children: typeNodes.map(n => ({
          id: n.id,
          name: n.id.split('.').pop() || n.id,
          type: n.type,
          language: n.language,
          filePath: n.filePath,
          l2_desc: n.l2_desc,
          isVirtual: false,
        })),
      };
      
      root.children!.push(typeNode);
    });

    // Сортируем типы
    root.children!.sort((a, b) => a.name.localeCompare(b.name));

    return root;
  }

  /** Применить collapsed state к иерархии */
  private applyCollapsedState(node: HierarchyNodeData): void {
    if (!node.children) return;

    if (this.collapsedNodes.has(node.id)) {
      // Скрываем детей
      (node as any)._children = node.children;
      node.children = undefined;
    } else {
      // Рекурсивно применяем к детям
      for (const child of node.children) {
        this.applyCollapsedState(child);
      }
    }
  }

  /** Переключить состояние сворачивания узла */
  private toggleCollapse(nodeId: string): void {
    if (this.collapsedNodes.has(nodeId)) {
      this.collapsedNodes.delete(nodeId);
    } else {
      this.collapsedNodes.add(nodeId);
    }

    // Перерисовываем
    if (this.updateCallback) {
      this.updateCallback();
    }
  }

  /** Отрисовка связей */
  private renderLinks(links: d3.HierarchyPointLink<HierarchyNodeData>[]): void {
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
      .attr('stroke', '#475569')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0);

    // UPDATE + ENTER
    linkEnter.merge(linkSelection)
      .transition()
      .duration(300)
      .attr('stroke-opacity', 0.4)
      .attr('d', d => {
        // Горизонтальные elbow-линии
        const sourceX = d.source.x!;
        const sourceY = d.source.y!;
        const targetX = d.target.x!;
        const targetY = d.target.y!;
        const midX = sourceX + (targetX - sourceX) / 2;
        
        return `M${sourceX},${sourceY} H${midX} V${targetY} H${targetX}`;
      });
  }

  /** Отрисовка узлов */
  private renderNodes(
    nodes: d3.HierarchyPointNode<HierarchyNodeData>[],
    callbacks: LayoutCallbacks
  ): void {
    if (!this.nodesGroup) return;

    const self = this;

    const nodeSelection = this.nodesGroup
      .selectAll<SVGGElement, d3.HierarchyPointNode<HierarchyNodeData>>('g.project-node')
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
      .attr('class', 'project-node')
      .style('cursor', 'pointer')
      .style('opacity', 0);

    // Добавляем форму узла
    nodeEnter.each(function(d) {
      const el = d3.select(this);
      const nodeData = d.data;
      const hasChildren = d.children || (d.data as any)._children;

      if (nodeData.isVirtual) {
        // Виртуальные узлы (папки/группы)
        const isCollapsed = self.collapsedNodes.has(nodeData.id);
        
        // Иконка треугольника для сворачивания
        if (hasChildren || isCollapsed) {
          el.append('polygon')
            .attr('class', 'collapse-icon')
            .attr('points', isCollapsed ? '-4,-5 6,0 -4,5' : '-5,-4 0,6 5,-4')
            .attr('fill', '#64748b')
            .attr('transform', 'translate(-12, 0)');
        }

        // Иконка папки
        el.append('rect')
          .attr('width', 14)
          .attr('height', 10)
          .attr('x', -2)
          .attr('y', -5)
          .attr('rx', 2)
          .attr('fill', VIRTUAL_NODE_COLORS.FOLDER)
          .attr('stroke', '#475569')
          .attr('stroke-width', 0.5);

      } else {
        // Реальные узлы
        const fillColor = getNodeColor(nodeData.type);
        
        el.append('circle')
          .attr('r', 6)
          .attr('fill', fillColor)
          .attr('stroke', DEFAULT_STROKE)
          .attr('stroke-width', 1);
      }

      // Метка
      el.append('text')
        .text(nodeData.name)
        .attr('x', 16)
        .attr('y', 4)
        .attr('fill', nodeData.isVirtual ? '#94a3b8' : '#cbd5e1')
        .attr('font-size', nodeData.isVirtual ? '11px' : '10px')
        .attr('font-weight', nodeData.isVirtual ? 'bold' : 'normal')
        .style('pointer-events', 'none');

      // Счётчик детей для свёрнутых узлов
      if (nodeData.isVirtual && self.collapsedNodes.has(nodeData.id)) {
        const hiddenChildren = (nodeData as any)._children;
        if (hiddenChildren && hiddenChildren.length > 0) {
          const countChildren = (node: HierarchyNodeData): number => {
            if (!node.children) return node.isVirtual ? 0 : 1;
            return node.children.reduce((sum, c) => sum + countChildren(c), 0);
          };
          const total = hiddenChildren.reduce((sum: number, c: HierarchyNodeData) => sum + countChildren(c), 0);
          
          el.append('text')
            .text(`(${total})`)
            .attr('x', 16 + nodeData.name.length * 6)
            .attr('y', 4)
            .attr('fill', '#64748b')
            .attr('font-size', '9px')
            .style('pointer-events', 'none');
        }
      }
    });

    // Привязываем события
    nodeEnter
      .on('click', function(event, d) {
        // Если виртуальный узел с детьми - сворачиваем/разворачиваем
        if (d.data.isVirtual && (d.children || (d.data as any)._children)) {
          event.stopPropagation();
          self.toggleCollapse(d.data.id);
        } else if (callbacks.onNodeClick) {
          callbacks.onNodeClick(event, d.data as unknown as GraphNode);
        }
      })
      .on('dblclick', (event, d) => {
        if (!d.data.isVirtual && callbacks.onNodeDblClick) {
          callbacks.onNodeDblClick(event, d.data as unknown as GraphNode);
        }
      })
      .on('mouseenter', function(event, d) {
        // Hover эффект для папок
        if (d.data.isVirtual && (d.children || (d.data as any)._children)) {
          d3.select(this).select('rect')
            .attr('fill', '#f59e0b') // Оранжевый hover
            .attr('stroke', '#fbbf24');
          d3.select(this).select('.collapse-icon')
            .attr('fill', '#fbbf24');
        }
        if (!d.data.isVirtual && callbacks.onNodeMouseEnter) {
          callbacks.onNodeMouseEnter(event, d.data as unknown as GraphNode);
        }
      })
      .on('mouseleave', function(event, d) {
        // Сброс hover
        if (d.data.isVirtual) {
          d3.select(this).select('rect')
            .attr('fill', VIRTUAL_NODE_COLORS.FOLDER)
            .attr('stroke', '#475569');
          d3.select(this).select('.collapse-icon')
            .attr('fill', '#64748b');
        }
        if (!d.data.isVirtual && callbacks.onNodeMouseLeave) {
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

  /** Показать placeholder сообщение */
  private showPlaceholder(message: string): void {
    if (!this.container) return;

    this.linksGroup?.selectAll('*').remove();
    this.nodesGroup?.selectAll('*').remove();

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
    console.log(`[ProjectTreeLayout] [${getTimeStamp()}] Очистка ресурсов`);
    
    this.linksGroup?.remove();
    this.nodesGroup?.remove();
    
    this.container = null;
    this.treeLayout = null;
    this.linksGroup = null;
    this.nodesGroup = null;
    this.collapsedNodes.clear();
    this.updateCallback = null;
  }

  /** Сброс позиций и состояния сворачивания */
  resetPositions(): void {
    this.collapsedNodes.clear();
  }

  /** Получить текущее состояние свёрнутых узлов */
  getCollapsedNodes(): Set<string> {
    return new Set(this.collapsedNodes);
  }
}
