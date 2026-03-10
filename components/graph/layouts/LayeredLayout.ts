/**
 * LayeredLayout - Слоистая иерархическая раскладка графа (UML-style)
 * Использует алгоритм Sugiyama для распределения узлов по слоям
 * Узлы располагаются по уровням зависимостей: корни сверху, листья снизу
 */

import * as d3 from 'd3';
import {
  LayoutEngine,
  LayoutConfig,
  LayoutCallbacks,
  GraphNode,
  GraphLink,
} from '../types';
import {
  getTimeStamp,
} from '../utils';
import {
  getNodeColor,
  NODE_SIZES,
  DEFAULT_STROKE,
  YELLOW_SHADES,
  LINK_SETTINGS,
} from '../constants';
import { AiItemType } from '../../../types';

/** Узел с информацией о слое */
interface LayeredNode extends GraphNode {
  layer: number;
  order: number; // Позиция в слое
}

export class LayeredLayout implements LayoutEngine {
  private container: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private linksGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private labelsGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private nodesGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private width: number = 0;
  private height: number = 0;
  private currentNodes: LayeredNode[] = []; // Храним текущие узлы для drag

  init(
    container: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number,
    height: number
  ): void {
    console.log(`[LayeredLayout] [${getTimeStamp()}] Инициализация: ${width}x${height}`);
    
    this.container = container;
    this.width = width;
    this.height = height;

    // Очищаем контейнер
    container.selectAll('*').remove();

    // Создаём группы
    this.linksGroup = container.append('g').attr('class', 'layered-links');
    this.labelsGroup = container.append('g').attr('class', 'layered-labels');
    this.nodesGroup = container.append('g').attr('class', 'layered-nodes');
  }

  update(
    nodes: GraphNode[],
    links: GraphLink[],
    config: LayoutConfig,
    callbacks: LayoutCallbacks
  ): void {
    if (!this.container || !this.nodesGroup || !this.linksGroup || !this.labelsGroup) {
      console.warn('[LayeredLayout] Layout не инициализирован');
      return;
    }

    const { 
      layeredDirection = 'TB', 
      layerSpacing = 100, 
      nodeSpacing = 50,
      clickHistory = [] 
    } = config;

    console.log(`[LayeredLayout] [${getTimeStamp()}] Обновление: ${nodes.length} узлов, direction=${layeredDirection}`);

    if (nodes.length === 0) {
      this.showPlaceholder('Нет данных для отображения');
      return;
    }

    // Строим граф зависимостей и назначаем слои
    const layeredNodes = this.assignLayers(nodes, links);
    
    // Упорядочиваем узлы в каждом слое для минимизации пересечений
    this.orderNodesInLayers(layeredNodes, links);
    
    // Вычисляем координаты
    this.calculatePositions(layeredNodes, layeredDirection, layerSpacing, nodeSpacing);

    // Рендерим элементы
    console.log(`[LayeredLayout] Рендер: ${layeredNodes.length} узлов, позиции:`, 
      layeredNodes.slice(0, 3).map(n => ({ id: n.id, x: n.x, y: n.y, layer: n.layer })));
    this.renderLinks(links, layeredNodes, layeredDirection);
    this.renderLinkLabels(links, layeredNodes);
    this.renderNodes(layeredNodes, callbacks, clickHistory);
  }

  /** Назначение слоёв узлам (алгоритм longest path) */
  private assignLayers(nodes: GraphNode[], links: GraphLink[]): LayeredNode[] {
    // Создаём карту связей
    const outgoing = new Map<string, Set<string>>();
    const incoming = new Map<string, Set<string>>();
    
    nodes.forEach(n => {
      outgoing.set(n.id, new Set());
      incoming.set(n.id, new Set());
    });

    links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      if (outgoing.has(sourceId) && incoming.has(targetId)) {
        outgoing.get(sourceId)!.add(targetId);
        incoming.get(targetId)!.add(sourceId);
      }
    });

    // Находим корни (узлы без входящих рёбер)
    const roots = nodes.filter(n => incoming.get(n.id)!.size === 0);
    
    // BFS для назначения слоёв
    const layers = new Map<string, number>();
    const queue: { id: string; layer: number }[] = [];
    
    // Если нет корней, берём все узлы как корни (цикличный граф)
    if (roots.length === 0) {
      nodes.forEach(n => queue.push({ id: n.id, layer: 0 }));
    } else {
      roots.forEach(n => queue.push({ id: n.id, layer: 0 }));
    }

    while (queue.length > 0) {
      const { id, layer } = queue.shift()!;
      
      // Обновляем слой только если новый глубже
      const currentLayer = layers.get(id) ?? -1;
      if (layer > currentLayer) {
        layers.set(id, layer);
        
        // Добавляем потомков на следующий слой
        outgoing.get(id)?.forEach(childId => {
          queue.push({ id: childId, layer: layer + 1 });
        });
      }
    }

    // Создаём layered nodes
    return nodes.map(node => ({
      ...node,
      layer: layers.get(node.id) ?? 0,
      order: 0
    }));
  }

  /** Упорядочивание узлов в слоях для минимизации пересечений */
  private orderNodesInLayers(nodes: LayeredNode[], links: GraphLink[]): void {
    // Группируем по слоям
    const layerGroups = new Map<number, LayeredNode[]>();
    nodes.forEach(node => {
      if (!layerGroups.has(node.layer)) {
        layerGroups.set(node.layer, []);
      }
      layerGroups.get(node.layer)!.push(node);
    });

    // Создаём карту связей
    const incoming = new Map<string, string[]>();
    nodes.forEach(n => incoming.set(n.id, []));
    
    links.forEach(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      incoming.get(targetId)?.push(sourceId);
    });

    // Создаём lookup для позиций
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // Сортируем слои сверху вниз
    const layerIndices = Array.from(layerGroups.keys()).sort((a, b) => a - b);
    
    // Первый слой сортируем по id
    if (layerIndices.length > 0) {
      const firstLayer = layerGroups.get(layerIndices[0])!;
      firstLayer.sort((a, b) => a.id.localeCompare(b.id));
      firstLayer.forEach((node, i) => node.order = i);
    }

    // Остальные слои сортируем по барицентру (среднему положению родителей)
    for (let i = 1; i < layerIndices.length; i++) {
      const layer = layerGroups.get(layerIndices[i])!;
      
      layer.forEach(node => {
        const parents = incoming.get(node.id) || [];
        if (parents.length > 0) {
          const sum = parents.reduce((acc, pid) => {
            const parent = nodeById.get(pid);
            return acc + (parent?.order ?? 0);
          }, 0);
          node.order = sum / parents.length;
        } else {
          node.order = 0;
        }
      });

      // Сортируем по барицентру и назначаем целые позиции
      layer.sort((a, b) => a.order - b.order);
      layer.forEach((node, idx) => node.order = idx);
    }
  }

  /** Вычисление координат узлов */
  private calculatePositions(
    nodes: LayeredNode[],
    direction: 'TB' | 'BT' | 'LR' | 'RL',
    layerSpacing: number,
    nodeSpacing: number
  ): void {
    if (nodes.length === 0) return;

    // Группируем по слоям
    const layerGroups = new Map<number, LayeredNode[]>();
    nodes.forEach(node => {
      if (!layerGroups.has(node.layer)) {
        layerGroups.set(node.layer, []);
      }
      layerGroups.get(node.layer)!.push(node);
    });

    const layers = Array.from(layerGroups.keys()).sort((a, b) => a - b);
    const numLayers = layers.length;
    
    if (numLayers === 0) {
      nodes.forEach((node, i) => {
        node.x = this.width / 2 + (i % 5 - 2) * nodeSpacing;
        node.y = this.height / 2 + Math.floor(i / 5) * nodeSpacing;
      });
      return;
    }

    const isHorizontal = direction === 'LR' || direction === 'RL';
    const isReversed = direction === 'BT' || direction === 'RL';

    // Вычисляем размеры
    const layerSizes = layers.map(l => layerGroups.get(l)!.length);
    const maxNodesInLayer = Math.max(1, ...layerSizes);
    
    // Адаптивные расстояния - вписываем в контейнер
    const padding = 40;
    const availableLayerSpace = isHorizontal ? this.width - padding * 2 : this.height - padding * 2;
    const availableNodeSpace = isHorizontal ? this.height - padding * 2 : this.width - padding * 2;
    
    const effectiveLayerSpacing = Math.min(layerSpacing, availableLayerSpace / Math.max(1, numLayers - 1 || 1));
    const effectiveNodeSpacing = Math.min(nodeSpacing, availableNodeSpace / Math.max(1, maxNodesInLayer - 1 || 1));

    // Центрирование
    const totalLayerLength = (numLayers - 1) * effectiveLayerSpacing;
    const totalNodeLength = (maxNodesInLayer - 1) * effectiveNodeSpacing;
    
    const startX = isHorizontal 
      ? (this.width - totalLayerLength) / 2
      : (this.width - totalNodeLength) / 2;
    const startY = isHorizontal
      ? (this.height - totalNodeLength) / 2
      : (this.height - totalLayerLength) / 2;

    layers.forEach((layer, layerIdx) => {
      const nodesInLayer = layerGroups.get(layer)!;
      nodesInLayer.sort((a, b) => a.order - b.order);

      // Центрируем узлы в слое
      const layerNodeLength = (nodesInLayer.length - 1) * effectiveNodeSpacing;
      const layerOffset = (totalNodeLength - layerNodeLength) / 2;

      nodesInLayer.forEach((node, nodeIdx) => {
        if (isHorizontal) {
          node.x = startX + (isReversed ? (numLayers - 1 - layerIdx) : layerIdx) * effectiveLayerSpacing;
          node.y = startY + layerOffset + nodeIdx * effectiveNodeSpacing;
        } else {
          node.x = startX + layerOffset + nodeIdx * effectiveNodeSpacing;
          node.y = startY + (isReversed ? (numLayers - 1 - layerIdx) : layerIdx) * effectiveLayerSpacing;
        }
      });
    });
  }

  /** Отрисовка связей */
  private renderLinks(
    links: GraphLink[],
    nodes: LayeredNode[],
    direction: 'TB' | 'BT' | 'LR' | 'RL'
  ): void {
    if (!this.linksGroup) return;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const isHorizontal = direction === 'LR' || direction === 'RL';

    // Диагностика
    console.log(`[LayeredLayout] renderLinks: ${links.length} links, nodeMap size: ${nodeMap.size}`);
    if (links.length > 0) {
      const firstLink = links[0];
      const sId = typeof firstLink.source === 'string' ? firstLink.source : (firstLink.source as any)?.id;
      const tId = typeof firstLink.target === 'string' ? firstLink.target : (firstLink.target as any)?.id;
      const sourceNode = nodeMap.get(sId);
      const targetNode = nodeMap.get(tId);
      console.log(`[LayeredLayout] First link: ${sId} -> ${tId}`, {
        sourceFound: !!sourceNode,
        targetFound: !!targetNode,
        sourcePos: sourceNode ? { x: sourceNode.x, y: sourceNode.y } : null,
        targetPos: targetNode ? { x: targetNode.x, y: targetNode.y } : null
      });
    }

    const validLinks = links.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any)?.id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any)?.id;
      return sourceId && targetId && nodeMap.has(sourceId) && nodeMap.has(targetId);
    });

    console.log(`[LayeredLayout] Valid links: ${validLinks.length} of ${links.length}`);
    
    // Проверяем координаты первой связи
    if (validLinks.length > 0) {
      const first = validLinks[0];
      const sId = typeof first.source === 'string' ? first.source : (first.source as any)?.id;
      const tId = typeof first.target === 'string' ? first.target : (first.target as any)?.id;
      const src = nodeMap.get(sId);
      const tgt = nodeMap.get(tId);
      if (src && tgt) {
        console.log(`[LayeredLayout] Path coords: M${src.x},${src.y} -> ${tgt.x},${tgt.y}`);
      }
    }

    const linkSelection = this.linksGroup
      .selectAll<SVGPathElement, GraphLink>('path')
      .data(validLinks, (d: any) => {
        const s = typeof d.source === 'string' ? d.source : d.source.id;
        const t = typeof d.target === 'string' ? d.target : d.target.id;
        return `${s}-${t}`;
      });

    linkSelection.exit().remove();

    const linkEnter = linkSelection.enter()
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', LINK_SETTINGS.STROKE_COLOR)
      .attr('stroke-width', LINK_SETTINGS.STROKE_WIDTH)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrowhead)');

    linkEnter.merge(linkSelection)
      .attr('d', d => {
        const sourceId = typeof d.source === 'string' ? d.source : (d.source as any)?.id;
        const targetId = typeof d.target === 'string' ? d.target : (d.target as any)?.id;
        const source = nodeMap.get(sourceId);
        const target = nodeMap.get(targetId);
        
        if (!source || !target || source.x === undefined || target.x === undefined) {
          console.warn(`[LayeredLayout] Missing coords for link ${sourceId} -> ${targetId}`);
          return '';
        }

        // Используем кривую Безье для более плавных линий
        if (isHorizontal) {
          const midX = (source.x + target.x) / 2;
          return `M${source.x},${source.y} C${midX},${source.y} ${midX},${target.y} ${target.x},${target.y}`;
        } else {
          const midY = (source.y! + target.y!) / 2;
          return `M${source.x},${source.y} C${source.x},${midY} ${target.x},${midY} ${target.x},${target.y}`;
        }
      });
  }

  /** Отрисовка меток связей */
  private renderLinkLabels(links: GraphLink[], nodes: LayeredNode[]): void {
    if (!this.labelsGroup) return;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const validLinks = links.filter(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      const label = link.label || link.type || '';
      return nodeMap.has(sourceId) && nodeMap.has(targetId) && label;
    });

    const labelSelection = this.labelsGroup
      .selectAll<SVGTextElement, GraphLink>('text')
      .data(validLinks, (d: any) => {
        const s = typeof d.source === 'string' ? d.source : d.source.id;
        const t = typeof d.target === 'string' ? d.target : d.target.id;
        return `${s}-${t}-label`;
      });

    labelSelection.exit().remove();

    const labelEnter = labelSelection.enter()
      .append('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '9px')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none');

    labelEnter.merge(labelSelection)
      .text(d => d.label || d.type || '')
      .attr('x', d => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target.id;
        const source = nodeMap.get(sourceId)!;
        const target = nodeMap.get(targetId)!;
        return (source.x! + target.x!) / 2;
      })
      .attr('y', d => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target.id;
        const source = nodeMap.get(sourceId)!;
        const target = nodeMap.get(targetId)!;
        return (source.y! + target.y!) / 2 - 5;
      });
  }

  /** Отрисовка узлов */
  private renderNodes(
    nodes: LayeredNode[],
    callbacks: LayoutCallbacks,
    clickHistory: string[]
  ): void {
    if (!this.nodesGroup) return;

    // Сохраняем узлы для drag
    this.currentNodes = nodes;

    const self = this;

    const nodeSelection = this.nodesGroup
      .selectAll<SVGGElement, LayeredNode>('g.layered-node')
      .data(nodes, d => d.id);

    nodeSelection.exit()
      .transition()
      .duration(200)
      .style('opacity', 0)
      .remove();

    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'layered-node')
      .style('cursor', 'pointer')
      .style('opacity', 0);

    // Форма узла
    nodeEnter.each(function(d) {
      const el = d3.select(this);
      const fillColor = getNodeColor(d.type);
      
      // Выделение по истории кликов
      const historyIndex = clickHistory.indexOf(d.id);
      const strokeColor = historyIndex !== -1 ? YELLOW_SHADES[historyIndex] : DEFAULT_STROKE;
      const strokeWidth = historyIndex !== -1 ? 4 : NODE_SIZES.STROKE_WIDTH_DEFAULT;

      if (d.type === AiItemType.TABLE) {
        const size = 28;
        el.append('rect')
          .attr('width', size)
          .attr('height', size)
          .attr('x', -size / 2)
          .attr('y', -size / 2)
          .attr('fill', fillColor)
          .attr('stroke', strokeColor)
          .attr('stroke-width', strokeWidth);
      } else if (d.type === AiItemType.TABLE_COLUMN) {
        const width = 28;
        const height = width / 3;
        el.append('rect')
          .attr('width', width)
          .attr('height', height)
          .attr('x', -width / 2)
          .attr('y', -height / 2)
          .attr('fill', fillColor)
          .attr('stroke', strokeColor)
          .attr('stroke-width', strokeWidth);
      } else {
        el.append('circle')
          .attr('r', NODE_SIZES.CIRCLE_RADIUS * 0.7)
          .attr('fill', fillColor)
          .attr('stroke', strokeColor)
          .attr('stroke-width', strokeWidth);
      }

      // Метка
      el.append('text')
        .text(d.id.split('.').pop() || d.id)
        .attr('x', 18)
        .attr('y', 4)
        .attr('fill', '#cbd5e1')
        .attr('font-size', '10px')
        .style('pointer-events', 'none')
        .style('text-shadow', '1px 1px 2px #000');
    });

    // Drag behavior
    const dragBehavior = d3.drag<SVGGElement, LayeredNode>()
      .on('start', function(event) {
        event.sourceEvent.stopPropagation();
        d3.select(this).raise().classed('dragging', true);
      })
      .on('drag', function(event, d) {
        d.x = event.x;
        d.y = event.y;
        d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
        // Обновляем координаты в массиве
        const nodeInArray = self.currentNodes.find(n => n.id === d.id);
        if (nodeInArray) {
          nodeInArray.x = d.x;
          nodeInArray.y = d.y;
        }
        self.updateLinksPositions();
      })
      .on('end', function() {
        d3.select(this).classed('dragging', false);
      });

    nodeEnter.call(dragBehavior);

    // События
    nodeEnter
      .on('click', (event, d) => {
        if (callbacks.onNodeClick) callbacks.onNodeClick(event, d as GraphNode);
      })
      .on('dblclick', (event, d) => {
        if (callbacks.onNodeDblClick) callbacks.onNodeDblClick(event, d as GraphNode);
      })
      .on('mouseenter', (event, d) => {
        if (callbacks.onNodeMouseEnter) callbacks.onNodeMouseEnter(event, d as GraphNode);
      })
      .on('mouseleave', (event, d) => {
        if (callbacks.onNodeMouseLeave) callbacks.onNodeMouseLeave(event, d as GraphNode);
      });

    // Позиционирование и анимация
    nodeEnter
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // Показываем узлы
    nodeEnter.transition()
      .duration(300)
      .style('opacity', 1);

    // Объединяем enter + update
    const nodeUpdate = nodeEnter.merge(nodeSelection);

    // Обновление позиций существующих узлов
    nodeUpdate
      .transition()
      .duration(300)
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('opacity', 1);
  }

  /** Обновление позиций связей при drag */
  private updateLinksPositions(): void {
    if (!this.linksGroup || !this.labelsGroup) return;

    const nodeMap = new Map(this.currentNodes.map(n => [n.id, n]));

    this.linksGroup.selectAll<SVGPathElement, GraphLink>('path')
      .attr('d', d => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target.id;
        const source = nodeMap.get(sourceId);
        const target = nodeMap.get(targetId);
        if (!source || !target) return '';

        const midY = (source.y! + target.y!) / 2;
        return `M${source.x},${source.y} C${source.x},${midY} ${target.x},${midY} ${target.x},${target.y}`;
      });

    this.labelsGroup.selectAll<SVGTextElement, GraphLink>('text')
      .attr('x', d => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target.id;
        const source = nodeMap.get(sourceId);
        const target = nodeMap.get(targetId);
        return source && target ? (source.x! + target.x!) / 2 : 0;
      })
      .attr('y', d => {
        const sourceId = typeof d.source === 'string' ? d.source : d.source.id;
        const targetId = typeof d.target === 'string' ? d.target : d.target.id;
        const source = nodeMap.get(sourceId);
        const target = nodeMap.get(targetId);
        return source && target ? (source.y! + target.y!) / 2 - 5 : 0;
      });
  }

  /** Placeholder */
  private showPlaceholder(message: string): void {
    if (!this.container) return;

    this.linksGroup?.selectAll('*').remove();
    this.nodesGroup?.selectAll('*').remove();
    this.labelsGroup?.selectAll('*').remove();

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

  destroy(): void {
    console.log(`[LayeredLayout] [${getTimeStamp()}] Очистка ресурсов`);
    
    this.linksGroup?.remove();
    this.nodesGroup?.remove();
    this.labelsGroup?.remove();
    
    this.container = null;
    this.linksGroup = null;
    this.nodesGroup = null;
    this.labelsGroup = null;
  }

  resetPositions(): void {
    // Перезапускаем layout
  }
}
