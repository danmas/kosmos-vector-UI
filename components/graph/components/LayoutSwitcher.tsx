/**
 * LayoutSwitcher - Переключатель режимов отображения графа
 * Компактная панель с кнопками: Force | Call Tree | Project Tree
 */

import React from 'react';
import { GraphLayoutMode } from '../types';

interface LayoutSwitcherProps {
  /** Текущий режим */
  mode: GraphLayoutMode;
  /** Callback при смене режима */
  onChange: (mode: GraphLayoutMode) => void;
  /** Отключить переключатель */
  disabled?: boolean;
}

/** Конфигурация режимов */
const LAYOUT_MODES: { mode: GraphLayoutMode; label: string; icon: string; title: string }[] = [
  { 
    mode: 'force', 
    label: 'Force', 
    icon: '🔮',
    title: 'Force-directed layout: узлы распределяются по силам притяжения/отталкивания'
  },
  { 
    mode: 'call-tree', 
    label: 'Call Tree', 
    icon: '🌲',
    title: 'Call Tree: иерархическое дерево вызовов от выбранного узла'
  },
  { 
    mode: 'project-tree', 
    label: 'Project', 
    icon: '📁',
    title: 'Project Tree: дерево по структуре файлов/пакетов'
  },
];

export const LayoutSwitcher: React.FC<LayoutSwitcherProps> = ({
  mode,
  onChange,
  disabled = false,
}) => {
  return (
    <div className="flex items-center gap-0.5 bg-slate-800/50 rounded-md p-0.5 border border-slate-700">
      {LAYOUT_MODES.map(({ mode: layoutMode, label, icon, title }) => (
        <button
          key={layoutMode}
          onClick={() => onChange(layoutMode)}
          disabled={disabled}
          title={title}
          className={`
            flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium
            transition-all duration-150
            ${mode === layoutMode
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          <span className="text-xs">{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
};

export default LayoutSwitcher;
