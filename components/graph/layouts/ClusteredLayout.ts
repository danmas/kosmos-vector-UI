/**
 * ClusteredLayout - Кластеризованный вид графа
 * Узлы группируются по типу/пакету/директории и располагаются кластерами
 * С визуализацией границ кластеров (convex hull)
 */

import * as d3 from 'd3';
import {
  LayoutEngine,
  LayoutConfig,
  LayoutCallbacks,
  GraphNode,
  GraphLink,
  ClusterGroupBy,
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

/** Цвета для кластеров */
const CLUSTER_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
  '#06b6d4', // cyan
];

/** Узел с информацией о кластере */
interface ClusteredNode extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  language: string;
  filePath: string;
  l2_desc?: string;
  tags?: { code: string; name?: string }[];
  cluster: string;
  clusterIndex: number;
}

export class ClusteredLayout implements LayoutEngine {
  private container: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private simulation: d3.Simulation<ClusteredNode, undefined> | null = null;
  private linksGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private hullsGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private nodesGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private width: number = 0;
  private height: number = 0;
  private clusterCenters: Map<string, { x: number; y: number }> = new Map();

  init(
    container: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number,
    height: number
  ): void {
    console.log(`[ClusteredLayout] [${getTimeStamp()}] Инициализация: ${width}x${height}`);
    
    this.container = container;
    this.width = width;
    this.height = height;

    // Очищаем контейнер
    container.selectAll('*').remove();

    // Создаём группы (hulls под связями, связи под узлами)
    this.hullsGroup = container.append('g').attr('class', 'hulls-group');
    this.linksGroup = container.append('g').attr('class', 'links-group');
    this.nodesGroup = container.append('g').attr('class', 'nodes-group');

    // Создаём симуляцию
    this.simulation = d3.forceSimulation<ClusteredNode>()
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30))
      .alphaDecay(0.02)
      .stop();
  }

  update(
    nodes: GraphNode[],
    links: GraphLink[],
    config: LayoutConfig,
    callbacks: LayoutCallbacks
  ): void {
    if (!this.container || !this.simulation || !this.nodesGroup || !this.linksGroup || !this.hullsGroup) {
      console.warn('[ClusteredLayout] Layout не инициализирован');
      return;
    }

    const { clusterBy = 'type', showClusterHulls = true, clickHistory = [] } = config;

    console.log(`[ClusteredLayout] [${getTimeStamp()}] Обновление: ${nodes.length} узлов, clusterBy=${clusterBy}`);

    if (nodes.length === 0) {
      this.showPlaceholder('Нет данных для отображения');
      return;
    }

    // Группируем узлы по кластерам
    const clusters = this.groupNodesByCluster(nodes, clusterBy);
    const clusterNames = Array.from(clusters.keys());
    
    // Вычисляем центры кластеров (располагаем по кругу)
    this.calculateClusterCenters(clusterNames);

    // Создаём clustered nodes
    const clusteredNodes: ClusteredNode[] = nodes.map(node => {
      const cluster = this.getNodeCluster(node, clusterBy);
      const clusterIndex = clusterNames.indexOf(cluster);
      const center = this.clusterCenters.get(cluster) || { x: this.width / 2, y: this.height / 2 };
      
      return {
        ...node,
        cluster,
        clusterIndex,
        // Начальная позиция около центра кластера с небольшим разбросом
        x: node.x ?? center.x + (Math.random() - 0.5) * 100,
        y: node.y ?? center.y + (Math.random() - 0.5) * 100,
      };
    });

    // Обновляем симуляцию
    this.simulation
      .nodes(clusteredNodes)
      .force('link', d3.forceLink<ClusteredNode, d3.SimulationLinkDatum<ClusteredNode>>()
        .id(d => d.id)
        .distance(80)
        .strength(0.3)
        .links(links.map(l => ({
          source: typeof l.source === 'string' ? l.source : l.source.id,
          target: typeof l.target === 'string' ? l.target : l.target.id
        })))
      )
      .force('cluster', this.clusterForce(clusteredNodes, 0.3))
      .force('collision', d3.forceCollide<ClusteredNode>().radius(25));

    // Рендерим элементы
    this.renderLinks(links, clusteredNodes);
    this.renderNodes(clusteredNodes, callbacks, clickHistory);
    
    if (showClusterHulls) {
      this.renderHulls(clusteredNodes, clusterNames);
    } else {
      this.hullsGroup.selectAll('*').remove();
    }

    // Tick handler
    this.simulation.on('tick', () => {
      this.updatePositions(clusteredNodes, links, clusterNames, showClusterHulls);
    });

    // Запускаем симуляцию
    this.simulation.alpha(0.8).restart();
  }

  /** Группировка узлов по кластерам */
  private groupNodesByCluster(nodes: GraphNode[], clusterBy: ClusterGroupBy): Map<string, GraphNode[]> {
    const clusters = new Map<string, GraphNode[]>();

    for (const node of nodes) {
      const cluster = this.getNodeCluster(node, clusterBy);
      if (!clusters.has(cluster)) {
        clusters.set(cluster, []);
      }
      clusters.get(cluster)!.push(node);
    }

    return clusters;
  }

  /** Получить имя кластера для узла */
  private getNodeCluster(node: GraphNode, clusterBy: ClusterGroupBy): string {
    switch (clusterBy) {
      case 'type':
        return node.type || 'unknown';
      case 'package':
        // Извлекаем пакет из id (первые 2 части)
        const parts = node.id.split('.');
        return parts.length > 1 ? parts.slice(0, 2).join('.') : parts[0];
      case 'file-dir':
        // Извлекаем директорию из filePath
        if (node.filePath) {
          const pathParts = node.filePath.replace(/\\/g, '/').split('/');
          return pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'root';
        }
        return 'unknown';
      case 'tags':
        // Кластеризация по первому тегу
        if (node.tags && node.tags.length > 0) {
          return node.tags[0].name || node.tags[0].code || 'no-tag';
        }
        return 'no-tag';
      case 'auto':
      default:
        // Автоматическая кластеризация по типу
        return node.type || 'unknown';
    }
  }

  /** Вычислить центры кластеров (располагаем по кругу) */
  private calculateClusterCenters(clusterNames: string[]): void {
    this.clusterCenters.clear();
    const n = clusterNames.length;
    const radius = Math.min(this.width, this.height) * 0.35;
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    clusterNames.forEach((name, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2; // Начинаем сверху
      this.clusterCenters.set(name, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
    });
  }

  /** Сила притяжения к центру кластера */
  private clusterForce(nodes: ClusteredNode[], strength: number) {
    return (alpha: number) => {
      for (const node of nodes) {
        const center = this.clusterCenters.get(node.cluster);
        if (center && node.x !== undefined && node.y !== undefined) {
          node.vx = (node.vx || 0) + (center.x - node.x) * strength * alpha;
          node.vy = (node.vy || 0) + (center.y - node.y) * strength * alpha;
        }
      }
    };
  }

  /** Отрисовка связей */
  private renderLinks(links: GraphLink[], nodes: ClusteredNode[]): void {
    if (!this.linksGroup) return;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const linkSelection = this.linksGroup
      .selectAll<SVGLineElement, GraphLink>('line')
      .data(links, (d: any) => `${d.source?.id || d.source}-${d.target?.id || d.target}`);

    linkSelection.exit().remove();

    const linkEnter = linkSelection.enter()
      .append('line')
      .attr('stroke', LINK_SETTINGS.STROKE_COLOR)
      .attr('stroke-width', LINK_SETTINGS.STROKE_WIDTH)
      .attr('stroke-opacity', 0.3)
      .attr('marker-end', 'url(#arrowhead)');

    linkEnter.merge(linkSelection);
  }

  /** Отрисовка оболочек кластеров */
  private renderHulls(nodes: ClusteredNode[], clusterNames: string[]): void {
    if (!this.hullsGroup) return;

    const hullData = clusterNames.map((name, i) => ({
      name,
      color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
      nodes: nodes.filter(n => n.cluster === name),
    })).filter(d => d.nodes.length >= 3); // Hull нужно минимум 3 точки

    const hullSelection = this.hullsGroup
      .selectAll<SVGPathElement, typeof hullData[0]>('path.cluster-hull')
      .data(hullData, d => d.name);

    hullSelection.exit().remove();

    const hullEnter = hullSelection.enter()
      .append('path')
      .attr('class', 'cluster-hull')
      .attr('fill-opacity', 0.08)
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5');

    hullEnter.merge(hullSelection)
      .attr('fill', d => d.color)
      .attr('stroke', d => d.color);

    // Добавляем метки кластеров
    const labelSelection = this.hullsGroup
      .selectAll<SVGTextElement, typeof hullData[0]>('text.cluster-label')
      .data(hullData, d => d.name);

    labelSelection.exit().remove();

    const labelEnter = labelSelection.enter()
      .append('text')
      .attr('class', 'cluster-label')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill-opacity', 0.6)
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none');

    labelEnter.merge(labelSelection)
      .text(d => d.name)
      .attr('fill', d => d.color);
  }

  /** Отрисовка узлов */
  private renderNodes(
    nodes: ClusteredNode[],
    callbacks: LayoutCallbacks,
    clickHistory: string[]
  ): void {
    if (!this.nodesGroup) return;

    const self = this;

    const nodeSelection = this.nodesGroup
      .selectAll<SVGGElement, ClusteredNode>('g.cluster-node')
      .data(nodes, d => d.id);

    nodeSelection.exit()
      .transition()
      .duration(200)
      .style('opacity', 0)
      .remove();

    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'cluster-node')
      .style('cursor', 'pointer')
      .style('opacity', 0);

    // Форма узла
    nodeEnter.each(function(d) {
      const el = d3.select(this);
      const fillColor = getNodeColor(d.type);
      const clusterColor = CLUSTER_COLORS[d.clusterIndex % CLUSTER_COLORS.length];
      
      // Выделение по истории кликов
      const historyIndex = clickHistory.indexOf(d.id);
      const strokeColor = historyIndex !== -1 ? YELLOW_SHADES[historyIndex] : clusterColor;
      const strokeWidth = historyIndex !== -1 ? 4 : 2;

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
    const dragBehavior = d3.drag<SVGGElement, ClusteredNode>()
      .on('start', function(event, d) {
        if (!event.active) self.simulation?.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        event.sourceEvent.stopPropagation();
      })
      .on('drag', function(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', function(event, d) {
        if (!event.active) self.simulation?.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeEnter.call(dragBehavior);

    // События
    nodeEnter
      .on('click', (event, d) => {
        if (callbacks.onNodeClick) {
          callbacks.onNodeClick(event, d as GraphNode);
        }
      })
      .on('dblclick', (event, d) => {
        if (callbacks.onNodeDblClick) {
          callbacks.onNodeDblClick(event, d as GraphNode);
        }
      })
      .on('mouseenter', (event, d) => {
        if (callbacks.onNodeMouseEnter) {
          callbacks.onNodeMouseEnter(event, d as GraphNode);
        }
      })
      .on('mouseleave', (event, d) => {
        if (callbacks.onNodeMouseLeave) {
          callbacks.onNodeMouseLeave(event, d as GraphNode);
        }
      });

    // Анимация появления
    nodeEnter.transition()
      .duration(300)
      .style('opacity', 1);
  }

  /** Обновление позиций на каждом tick */
  private updatePositions(
    nodes: ClusteredNode[],
    links: GraphLink[],
    clusterNames: string[],
    showHulls: boolean
  ): void {
    // Обновляем позиции узлов
    this.nodesGroup?.selectAll<SVGGElement, ClusteredNode>('g.cluster-node')
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // Обновляем позиции связей
    this.linksGroup?.selectAll<SVGLineElement, GraphLink>('line')
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y);

    // Обновляем hulls
    if (showHulls && this.hullsGroup) {
      this.hullsGroup.selectAll<SVGPathElement, { name: string; nodes: ClusteredNode[] }>('path.cluster-hull')
        .attr('d', d => {
          const points = d.nodes.map(n => [n.x!, n.y!] as [number, number]);
          if (points.length < 3) return '';
          const hull = d3.polygonHull(points);
          if (!hull) return '';
          // Добавляем padding к hull
          return this.expandHull(hull, 20);
        });

      // Обновляем позиции меток
      this.hullsGroup.selectAll<SVGTextElement, { name: string; nodes: ClusteredNode[] }>('text.cluster-label')
        .attr('x', d => {
          const center = this.clusterCenters.get(d.name);
          return center?.x ?? 0;
        })
        .attr('y', d => {
          const center = this.clusterCenters.get(d.name);
          // Ставим метку выше центра
          return (center?.y ?? 0) - Math.min(this.width, this.height) * 0.15;
        });
    }
  }

  /** Расширить hull на padding */
  private expandHull(hull: [number, number][], padding: number): string {
    // Вычисляем центр
    const cx = hull.reduce((sum, p) => sum + p[0], 0) / hull.length;
    const cy = hull.reduce((sum, p) => sum + p[1], 0) / hull.length;

    // Расширяем точки от центра
    const expanded = hull.map(p => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = (dist + padding) / dist;
      return [cx + dx * scale, cy + dy * scale] as [number, number];
    });

    // Сглаживаем углы с помощью кривой
    return 'M' + expanded.map(p => p.join(',')).join('L') + 'Z';
  }

  /** Placeholder */
  private showPlaceholder(message: string): void {
    if (!this.container) return;

    this.linksGroup?.selectAll('*').remove();
    this.nodesGroup?.selectAll('*').remove();
    this.hullsGroup?.selectAll('*').remove();

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
    console.log(`[ClusteredLayout] [${getTimeStamp()}] Очистка ресурсов`);
    
    this.simulation?.stop();
    this.linksGroup?.remove();
    this.nodesGroup?.remove();
    this.hullsGroup?.remove();
    
    this.container = null;
    this.simulation = null;
    this.linksGroup = null;
    this.nodesGroup = null;
    this.hullsGroup = null;
    this.clusterCenters.clear();
  }

  resetPositions(): void {
    // Сбрасываем позиции узлов
    this.simulation?.alpha(1).restart();
  }
}
