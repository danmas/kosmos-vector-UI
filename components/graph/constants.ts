/**
 * Константы для модуля визуализации графа
 * Цвета, размеры, настройки отображения
 */

import { AiItemType } from '../../types';

// ============ НАСТРОЙКИ ГРАФА ============

export const GRAPH_SETTINGS = {
  /** Задержка появления tooltip при наведении на узел (мс) */
  TOOLTIP_DELAY_MS: 1000,
  /** Минимальный зум */
  MIN_ZOOM: 0.1,
  /** Максимальный зум */
  MAX_ZOOM: 4,
  /** Чувствительность колеса мыши для зума */
  WHEEL_SENSITIVITY: 0.15,
  /** Длительность анимации (мс) */
  ANIMATION_DURATION: 200,
};

// ============ ЦВЕТА УЗЛОВ ============

/** Цвета узлов по типам */
export const NODE_COLORS: Record<string, string> = {
  [AiItemType.FUNCTION]: '#3b82f6',    // blue
  [AiItemType.CLASS]: '#10b981',       // emerald
  [AiItemType.METHOD]: '#a855f7',      // purple
  [AiItemType.MODULE]: '#14b8a6',      // teal
  [AiItemType.STRUCT]: '#f59e0b',      // amber (go)
  [AiItemType.INTERFACE]: '#ec4899',   // pink
  [AiItemType.TABLE]: '#06b6d4',       // cyan
  [AiItemType.TABLE_COLUMN]: '#6366f1', // indigo
  DEFAULT: '#64748b',                   // slate
};

/** Получить цвет узла по типу */
export const getNodeColor = (type: string): string => {
  return NODE_COLORS[type] || NODE_COLORS.DEFAULT;
};

// ============ ЦВЕТА ОБВОДКИ ============

/** Жёлтые оттенки для истории кликов (5 уровней, от яркого к бледному) */
export const YELLOW_SHADES = [
  '#fbbf24', // Последний клик - ярко-жёлтый
  '#fcd34d',
  '#fde68a',
  '#fef08a',
  '#fef3c7', // 5-й клик - бледно-жёлтый
];

/** Цвет обводки для узла с tooltip */
export const TOOLTIP_STROKE = '#22c55e'; // Ярко-зелёный

/** Цвет обводки для множественного выделения */
export const MULTI_SELECT_STROKE = '#22c55e'; // Ярко-зелёный

/** Дефолтный цвет обводки */
export const DEFAULT_STROKE = '#1e293b'; // Тёмно-серый

/** Цвет фокусного узла */
export const FOCUS_STROKE = '#f59e0b'; // Янтарный

// ============ РАЗМЕРЫ УЗЛОВ ============

export const NODE_SIZES = {
  /** Радиус круглых узлов (Function, Class, Method, etc.) */
  CIRCLE_RADIUS: 20,
  /** Размер квадратных узлов (Table) */
  SQUARE_SIZE: 40,
  /** Ширина прямоугольных узлов (Table_Column) */
  RECT_WIDTH: 40,
  /** Высота прямоугольных узлов (соотношение 1:3) */
  RECT_HEIGHT: 40 / 3,
  /** Толщина обводки по умолчанию */
  STROKE_WIDTH_DEFAULT: 2,
  /** Толщина обводки при выделении */
  STROKE_WIDTH_SELECTED: 4,
};

// ============ НАСТРОЙКИ СВЯЗЕЙ ============

export const LINK_SETTINGS = {
  /** Цвет связей */
  STROKE_COLOR: '#475569',
  /** Толщина связей */
  STROKE_WIDTH: 1.5,
  /** Прозрачность связей */
  STROKE_OPACITY: 0.6,
  /** Размер стрелки */
  ARROW_SIZE: 8,
};

// ============ НАСТРОЙКИ FORCE SIMULATION ============

export const FORCE_SETTINGS = {
  /** Расстояние между связанными узлами */
  LINK_DISTANCE: 150,
  /** Сила отталкивания */
  CHARGE_STRENGTH: -400,
  /** Theta для Barnes-Hut оптимизации */
  CHARGE_THETA: 0.9,
  /** Максимальная дистанция для расчёта отталкивания */
  CHARGE_DISTANCE_MAX: 300,
  /** Радиус коллизии */
  COLLIDE_RADIUS: 40,
  /** Скорость затухания */
  ALPHA_DECAY: 0.05,
  /** Минимальный alpha (для остановки) */
  ALPHA_MIN: 0.001,
  /** Количество тиков прогрева */
  WARMUP_TICKS: 50,
};

// ============ НАСТРОЙКИ TREE LAYOUT ============

export const TREE_SETTINGS = {
  /** Вертикальный отступ между уровнями */
  LEVEL_HEIGHT: 80,
  /** Горизонтальный отступ между узлами */
  NODE_SPACING: 60,
  /** Отступ от края для дерева */
  PADDING: 50,
  /** Длина изгиба связей */
  LINK_CURVE: 30,
};

// ============ ЦВЕТА ДЛЯ ВИРТУАЛЬНЫХ УЗЛОВ (Project Tree) ============

export const VIRTUAL_NODE_COLORS = {
  FOLDER: '#94a3b8',     // Серый для папок
  PACKAGE: '#6366f1',    // Индиго для пакетов
  FILE: '#22c55e',       // Зелёный для файлов
};
