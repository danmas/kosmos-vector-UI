/**
 * Утилиты для модуля визуализации графа
 * Функции создания узлов, форматирования, логирования
 */

import * as d3 from 'd3';
import { AiItemType } from '../../types';
import { GraphNode, HierarchyNodeData } from './types';
import {
  getNodeColor,
  NODE_SIZES,
  YELLOW_SHADES,
  DEFAULT_STROKE,
  VIRTUAL_NODE_COLORS,
} from './constants';

// ============ ЛОГИРОВАНИЕ ============

/** Время загрузки страницы для относительных таймстампов */
let pageLoadTime = performance.now();

/** Сброс времени загрузки (для тестов) */
export const resetPageLoadTime = () => {
  pageLoadTime = performance.now();
};

/** Получить относительный таймстамп с начала загрузки */
export const getTimeStamp = (): string => {
  const now = performance.now();
  const elapsed = now - pageLoadTime;
  const seconds = Math.floor(elapsed / 1000);
  const ms = (elapsed % 1000).toFixed(1);
  return `${seconds}.${ms.padStart(4, '0')}s`;
};

/** Получить абсолютное время (реальное время) */
export const getAbsoluteTime = (): string => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
};

// ============ СОЗДАНИЕ ФОРМ УЗЛОВ ============

/**
 * Создать SVG-форму узла в зависимости от типа
 * @param el - D3 selection группы узла
 * @param node - Данные узла
 * @param clickHistory - История кликов для определения цвета обводки
 */
export const createNodeShape = (
  el: d3.Selection<SVGGElement, any, any, any>,
  node: GraphNode,
  clickHistory: string[] = []
): void => {
  const fillColor = getNodeColor(node.type);
  const historyIndex = clickHistory.indexOf(node.id);
  const strokeColor = historyIndex !== -1 ? YELLOW_SHADES[historyIndex] : DEFAULT_STROKE;
  const strokeWidth = historyIndex !== -1 
    ? NODE_SIZES.STROKE_WIDTH_SELECTED 
    : NODE_SIZES.STROKE_WIDTH_DEFAULT;

  if (node.type === AiItemType.TABLE) {
    // Квадрат для таблиц
    const size = NODE_SIZES.SQUARE_SIZE;
    el.append('rect')
      .attr('width', size)
      .attr('height', size)
      .attr('x', -size / 2)
      .attr('y', -size / 2)
      .attr('fill', fillColor)
      .attr('stroke', strokeColor)
      .attr('stroke-width', strokeWidth);
  } else if (node.type === AiItemType.TABLE_COLUMN) {
    // Прямоугольник для колонок (соотношение 1:3)
    const width = NODE_SIZES.RECT_WIDTH;
    const height = NODE_SIZES.RECT_HEIGHT;
    el.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('x', -width / 2)
      .attr('y', -height / 2)
      .attr('fill', fillColor)
      .attr('stroke', strokeColor)
      .attr('stroke-width', strokeWidth);
  } else {
    // Круг для всех остальных типов
    el.append('circle')
      .attr('r', NODE_SIZES.CIRCLE_RADIUS)
      .attr('fill', fillColor)
      .attr('stroke', strokeColor)
      .attr('stroke-width', strokeWidth);
  }

  // Метка узла (последняя часть ID после точки)
  el.append('text')
    .text(node.id.split('.').pop() || node.id)
    .attr('x', 25)
    .attr('y', 5)
    .attr('fill', '#cbd5e1')
    .attr('font-size', '12px')
    .style('pointer-events', 'none')
    .style('text-shadow', '2px 2px 4px #000');
};

/**
 * Создать форму виртуального узла (для Project Tree)
 * @param el - D3 selection группы узла
 * @param node - Данные иерархического узла
 * @param isExpanded - Развёрнут ли узел
 */
export const createVirtualNodeShape = (
  el: d3.Selection<SVGGElement, any, any, any>,
  node: HierarchyNodeData,
  isExpanded: boolean = true
): void => {
  const hasChildren = node.children && node.children.length > 0;
  
  if (node.isVirtual) {
    // Папка или пакет - треугольник/ромб
    const size = 12;
    
    if (hasChildren) {
      // Треугольник (указывает вниз если развёрнут, вправо если свёрнут)
      const points = isExpanded
        ? `0,${-size / 2} ${size / 2},${size / 2} ${-size / 2},${size / 2}`
        : `${-size / 2},${-size / 2} ${size / 2},0 ${-size / 2},${size / 2}`;
      
      el.append('polygon')
        .attr('points', points)
        .attr('fill', VIRTUAL_NODE_COLORS.FOLDER)
        .attr('stroke', '#64748b')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer');
    } else {
      // Маленький круг для пустых папок
      el.append('circle')
        .attr('r', 6)
        .attr('fill', VIRTUAL_NODE_COLORS.FOLDER)
        .attr('stroke', '#64748b')
        .attr('stroke-width', 1);
    }
  } else {
    // Реальный узел - используем стандартную форму
    createNodeShape(el, node as unknown as GraphNode);
    return;
  }

  // Метка виртуального узла
  el.append('text')
    .text(node.name)
    .attr('x', 18)
    .attr('y', 4)
    .attr('fill', node.isVirtual ? '#94a3b8' : '#cbd5e1')
    .attr('font-size', '11px')
    .style('pointer-events', 'none');
};

// ============ УТИЛИТЫ ДЛЯ РАБОТЫ С ГРАФОМ ============

/**
 * Получить ID источника связи (учитывая что D3 может заменить строку на объект)
 */
export const getLinkSourceId = (link: any): string => {
  return typeof link.source === 'string' ? link.source : link.source?.id;
};

/**
 * Получить ID цели связи
 */
export const getLinkTargetId = (link: any): string => {
  return typeof link.target === 'string' ? link.target : link.target?.id;
};

/**
 * Получить тип/метку связи
 */
export const getLinkType = (link: any): string => {
  return link.label || link.type || '';
};

/**
 * Найти все связанные узлы (соседей) для данного узла
 */
export const findRelatedNodeIds = (
  nodeId: string,
  links: any[],
  direction: 'incoming' | 'outgoing' | 'both' = 'both'
): Set<string> => {
  const relatedIds = new Set<string>();

  for (const link of links) {
    const sourceId = getLinkSourceId(link);
    const targetId = getLinkTargetId(link);

    if (direction === 'outgoing' || direction === 'both') {
      if (sourceId === nodeId) {
        relatedIds.add(targetId);
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      if (targetId === nodeId) {
        relatedIds.add(sourceId);
      }
    }
  }

  return relatedIds;
};

// ============ УТИЛИТЫ ДЛЯ ПОСТРОЕНИЯ ИЕРАРХИИ ============

/**
 * Построить иерархию из списка узлов по пути (filePath или id)
 * @param nodes - Список узлов
 * @param pathKey - Ключ для получения пути ('filePath' или 'id')
 * @param separator - Разделитель пути ('/' или '.')
 */
export const buildPathHierarchy = (
  nodes: GraphNode[],
  pathKey: 'filePath' | 'id' = 'filePath',
  separator: string = '/'
): HierarchyNodeData => {
  const root: HierarchyNodeData = {
    id: 'root',
    name: 'Root',
    type: 'root',
    isVirtual: true,
    children: [],
  };

  const pathMap = new Map<string, HierarchyNodeData>();
  pathMap.set('', root);

  for (const node of nodes) {
    const fullPath = pathKey === 'filePath' 
      ? (node.filePath || node.id)
      : node.id;
    
    // Нормализуем путь
    const normalizedPath = fullPath
      .replace(/^\.\//, '')
      .replace(/\\/g, '/');
    
    const parts = normalizedPath.split(separator).filter(Boolean);
    let currentPath = '';
    let parent = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}${separator}${part}` : part;

      let child = pathMap.get(currentPath);
      
      if (!child) {
        if (isLast) {
          // Это реальный узел
          child = {
            id: node.id,
            name: part,
            type: node.type,
            language: node.language,
            filePath: node.filePath,
            l2_desc: node.l2_desc,
            isVirtual: false,
            children: [],
          };
        } else {
          // Это промежуточный (виртуальный) узел
          child = {
            id: currentPath,
            name: part,
            type: 'folder',
            isVirtual: true,
            children: [],
          };
        }
        
        pathMap.set(currentPath, child);
        parent.children = parent.children || [];
        parent.children.push(child);
      }

      parent = child;
    }
  }

  return root;
};

/**
 * Построить иерархию вызовов от корневого узла
 * @param rootId - ID корневого узла
 * @param nodes - Все узлы графа
 * @param links - Все связи графа
 * @param direction - Направление построения дерева
 * @param maxDepth - Максимальная глубина
 * @param allowedLinkTypes - Разрешённые типы связей
 */
export const buildCallHierarchy = (
  rootId: string,
  nodes: GraphNode[],
  links: any[],
  direction: 'top-down' | 'bottom-up' = 'top-down',
  maxDepth: number = 3,
  allowedLinkTypes: string[] = ['calls', 'imports']
): HierarchyNodeData | null => {
  const nodesMap = new Map<string, GraphNode>();
  nodes.forEach(n => nodesMap.set(n.id, n));

  const rootNode = nodesMap.get(rootId);
  if (!rootNode) return null;

  const visited = new Set<string>();

  const buildRecursive = (nodeId: string, depth: number): HierarchyNodeData | null => {
    if (depth > maxDepth || visited.has(nodeId)) {
      return null;
    }

    visited.add(nodeId);
    const node = nodesMap.get(nodeId);
    if (!node) return null;

    const children: HierarchyNodeData[] = [];

    // Находим связанные узлы
    for (const link of links) {
      const linkType = getLinkType(link);
      if (allowedLinkTypes.length > 0 && !allowedLinkTypes.includes(linkType)) {
        continue;
      }

      const sourceId = getLinkSourceId(link);
      const targetId = getLinkTargetId(link);

      let childId: string | null = null;

      if (direction === 'top-down') {
        // Ищем исходящие (кого вызывает этот узел)
        if (sourceId === nodeId) {
          childId = targetId;
        }
      } else {
        // Ищем входящие (кто вызывает этот узел)
        if (targetId === nodeId) {
          childId = sourceId;
        }
      }

      if (childId && !visited.has(childId)) {
        const childHierarchy = buildRecursive(childId, depth + 1);
        if (childHierarchy) {
          children.push(childHierarchy);
        }
      }
    }

    return {
      id: node.id,
      name: node.id.split('.').pop() || node.id,
      type: node.type,
      language: node.language,
      filePath: node.filePath,
      l2_desc: node.l2_desc,
      isVirtual: false,
      children: children.length > 0 ? children : undefined,
    };
  };

  return buildRecursive(rootId, 0);
};

// ============ УТИЛИТЫ ДЛЯ SVG ============

/**
 * Создать path для curved link (для tree layout)
 */
export const createCurvedLinkPath = (
  source: { x: number; y: number },
  target: { x: number; y: number },
  direction: 'vertical' | 'horizontal' = 'vertical'
): string => {
  if (direction === 'vertical') {
    const midY = (source.y + target.y) / 2;
    return `M${source.x},${source.y} C${source.x},${midY} ${target.x},${midY} ${target.x},${target.y}`;
  } else {
    const midX = (source.x + target.x) / 2;
    return `M${source.x},${source.y} C${midX},${source.y} ${midX},${target.y} ${target.x},${target.y}`;
  }
};

/**
 * Создать маркер стрелки для defs
 */
export const createArrowMarker = (
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  id: string = 'arrowhead',
  color: string = '#475569'
): void => {
  defs.append('marker')
    .attr('id', id)
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 25)
    .attr('refY', 0)
    .attr('markerWidth', 8)
    .attr('markerHeight', 8)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', color);
};
