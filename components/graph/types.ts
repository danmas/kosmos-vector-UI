/**
 * Типы для модуля визуализации графа
 * Поддержка нескольких режимов отображения: Force, Call Tree, Project Tree
 */

import * as d3 from 'd3';

/** Режимы отображения графа */
export type GraphLayoutMode = 'force' | 'call-tree' | 'project-tree';

/** Направление отрисовки дерева */
export type TreeDirection = 'top-down' | 'bottom-up' | 'left-right' | 'right-left';

/** Группировка для Project Tree */
export type ProjectTreeGroupBy = 'file' | 'package' | 'type';

/** Конфигурация layout'а */
export interface LayoutConfig {
  mode: GraphLayoutMode;
  
  // === Для call-tree ===
  /** ID корневого узла (от которого строится дерево) */
  rootNodeId?: string;
  /** Направление отрисовки дерева */
  treeDirection?: TreeDirection;
  /** Максимальная глубина раскрытия (1-10) */
  maxDepth?: number;
  /** Типы связей для построения дерева */
  linkTypes?: string[];
  
  // === Для project-tree ===
  /** Группировка узлов */
  groupBy?: ProjectTreeGroupBy;
  /** Показывать свёрнутые узлы */
  collapsedNodes?: Set<string>;
  
  // === Общие ===
  /** История кликов для выделения узлов */
  clickHistory?: string[];
}

/** Узел графа (расширенный для layout'ов) */
export interface GraphNode {
  id: string;
  type: string;
  language: string;
  filePath: string;
  l2_desc?: string;
  // Координаты (заполняются layout'ом)
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  // Для дерева
  depth?: number;
  parent?: GraphNode | null;
  children?: GraphNode[];
  _children?: GraphNode[]; // Свёрнутые дети
}

/** Связь графа */
export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  label?: string | null;
  type?: string;
}

/** Данные графа */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Иерархический узел для D3 tree layout */
export interface HierarchyNodeData {
  id: string;
  name: string;
  type: string;
  language?: string;
  filePath?: string;
  l2_desc?: string;
  isVirtual?: boolean; // Для промежуточных узлов (папки, пакеты)
  linkType?: string; // Тип связи от родителя (calls, imports, etc.)
  children?: HierarchyNodeData[];
}

/** Интерфейс движка layout'а */
export interface LayoutEngine {
  /** Инициализация layout'а */
  init(
    container: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number,
    height: number
  ): void;
  
  /** Обновление отображения */
  update(
    nodes: GraphNode[],
    links: GraphLink[],
    config: LayoutConfig,
    callbacks: LayoutCallbacks
  ): void;
  
  /** Очистка ресурсов */
  destroy(): void;
  
  /** Сброс позиций */
  resetPositions?(): void;
}

/** Колбэки для взаимодействия с узлами */
export interface LayoutCallbacks {
  onNodeClick?: (event: MouseEvent, node: GraphNode) => void;
  onNodeDblClick?: (event: MouseEvent, node: GraphNode) => void;
  onNodeMouseEnter?: (event: MouseEvent, node: GraphNode) => void;
  onNodeMouseLeave?: (event: MouseEvent, node: GraphNode) => void;
  onNodeDragStart?: (event: any, node: GraphNode) => void;
  onNodeDrag?: (event: any, node: GraphNode) => void;
  onNodeDragEnd?: (event: any, node: GraphNode) => void;
}

/** Дефолтная конфигурация */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  mode: 'force',
  treeDirection: 'top-down',
  maxDepth: 3,
  linkTypes: ['calls', 'imports', 'reads_from', 'updates'],
  groupBy: 'file',
  collapsedNodes: new Set()
};
