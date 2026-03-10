/**
 * TreeControls - Панель управления настройками layout'ов
 * Показывается когда активен режим Call Tree, Project Tree или Clustered
 */

import React from 'react';
import { LayoutConfig, GraphLayoutMode, TreeDirection, ProjectTreeGroupBy, ClusterGroupBy } from '../types';

interface TreeControlsProps {
  /** Текущий режим layout'а */
  mode: GraphLayoutMode;
  /** Текущая конфигурация */
  config: LayoutConfig;
  /** Callback при изменении конфигурации */
  onChange: (config: Partial<LayoutConfig>) => void;
  /** ID выбранного узла (для Call Tree) */
  selectedNodeId: string | null;
  /** Отключить контролы */
  disabled?: boolean;
}

/** Опции направления для Call Tree */
const DIRECTION_OPTIONS: { value: TreeDirection; label: string; icon: string }[] = [
  { value: 'top-down', label: 'Callees', icon: '↓' },
  { value: 'bottom-up', label: 'Callers', icon: '↑' },
  { value: 'left-right', label: 'LR', icon: '→' },
];

/** Опции глубины */
const DEPTH_OPTIONS = [1, 2, 3, 4, 5];

/** Типы связей для Call Tree */
const LINK_TYPE_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'calls', label: 'calls', color: 'bg-blue-500' },
  { value: 'imports', label: 'imports', color: 'bg-purple-500' },
  { value: 'reads_from', label: 'reads', color: 'bg-green-500' },
  { value: 'updates', label: 'updates', color: 'bg-amber-500' },
  { value: 'depends_on', label: 'depends', color: 'bg-slate-500' },
];

/** Опции группировки для Project Tree */
const GROUP_BY_OPTIONS: { value: ProjectTreeGroupBy; label: string }[] = [
  { value: 'file', label: 'File Path' },
  { value: 'package', label: 'Package' },
  { value: 'type', label: 'Type' },
];

/** Опции группировки для Clustered */
const CLUSTER_BY_OPTIONS: { value: ClusterGroupBy; label: string; icon: string }[] = [
  { value: 'type', label: 'Type', icon: '🌐' },
  { value: 'package', label: 'Package', icon: '📦' },
  { value: 'file-dir', label: 'Directory', icon: '📂' },
  { value: 'tags', label: 'Tags', icon: '🏷️' },
];

/** Опции направления для Layered */
const LAYERED_DIRECTION_OPTIONS: { value: 'TB' | 'BT' | 'LR' | 'RL'; label: string; icon: string }[] = [
  { value: 'TB', label: 'Top-Down', icon: '↓' },
  { value: 'BT', label: 'Bottom-Up', icon: '↑' },
  { value: 'LR', label: 'Left-Right', icon: '→' },
  { value: 'RL', label: 'Right-Left', icon: '←' },
];

export const TreeControls: React.FC<TreeControlsProps> = ({
  mode,
  config,
  onChange,
  selectedNodeId,
  disabled = false,
}) => {
  // Не показываем для force режима
  if (mode === 'force') {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-2 py-1 bg-slate-800/30 rounded border border-slate-700/50">
      {/* === Call Tree Controls === */}
      {mode === 'call-tree' && (
        <>
          {/* Направление */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-500 uppercase">Dir:</span>
            <div className="flex gap-0.5">
              {DIRECTION_OPTIONS.map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => onChange({ treeDirection: value })}
                  disabled={disabled}
                  title={`${label} (${icon})`}
                  className={`
                    px-1.5 py-0.5 rounded text-[10px] font-medium
                    ${config.treeDirection === value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'
                    }
                    disabled:opacity-50
                  `}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Глубина */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-500 uppercase">Depth:</span>
            <div className="flex gap-0.5">
              {DEPTH_OPTIONS.map((depth) => (
                <button
                  key={depth}
                  onClick={() => onChange({ maxDepth: depth })}
                  disabled={disabled}
                  className={`
                    w-5 h-5 rounded text-[10px] font-bold
                    ${config.maxDepth === depth
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'
                    }
                    disabled:opacity-50
                  `}
                >
                  {depth}
                </button>
              ))}
            </div>
          </div>

          {/* Типы связей */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-500 uppercase">Links:</span>
            <div className="flex gap-1">
              {LINK_TYPE_OPTIONS.map(({ value, label, color }) => {
                const isActive = config.linkTypes?.includes(value) ?? 
                  (value === 'calls' || value === 'imports'); // дефолт
                return (
                  <button
                    key={value}
                    onClick={() => {
                      const currentTypes = config.linkTypes ?? ['calls', 'imports'];
                      const newTypes = isActive
                        ? currentTypes.filter(t => t !== value)
                        : [...currentTypes, value];
                      onChange({ linkTypes: newTypes.length > 0 ? newTypes : ['calls'] });
                    }}
                    disabled={disabled}
                    title={value}
                    className={`
                      px-1.5 py-0.5 rounded text-[9px] font-medium border
                      ${isActive
                        ? `${color} text-white border-transparent`
                        : 'bg-slate-800 text-slate-500 border-slate-600 hover:text-slate-300'
                      }
                      disabled:opacity-50
                    `}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Корневой узел */}
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[9px] text-slate-500 uppercase">Root:</span>
            {selectedNodeId ? (
              <span 
                className="text-[10px] text-green-400 font-mono max-w-[120px] truncate"
                title={selectedNodeId}
              >
                {selectedNodeId.split('.').pop()}
              </span>
            ) : (
              <span className="text-[10px] text-amber-400 italic">
                Select node...
              </span>
            )}
          </div>
        </>
      )}

      {/* === Project Tree Controls === */}
      {mode === 'project-tree' && (
        <>
          {/* Группировка */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-500 uppercase">Group by:</span>
            <div className="flex gap-0.5">
              {GROUP_BY_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onChange({ groupBy: value })}
                  disabled={disabled}
                  className={`
                    px-2 py-0.5 rounded text-[10px] font-medium
                    ${config.groupBy === value
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'
                    }
                    disabled:opacity-50
                  `}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Кнопка сброса свёрнутых узлов */}
          {config.collapsedNodes && config.collapsedNodes.size > 0 && (
            <button
              onClick={() => onChange({ collapsedNodes: new Set() })}
              disabled={disabled}
              className="px-2 py-0.5 rounded text-[10px] bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600"
              title="Развернуть все узлы"
            >
              Expand All
            </button>
          )}
        </>
      )}

      {/* === Clustered Controls === */}
      {mode === 'clustered' && (
        <>
          {/* Группировка кластеров */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-500 uppercase">Cluster by:</span>
            <div className="flex gap-0.5">
              {CLUSTER_BY_OPTIONS.map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => onChange({ clusterBy: value })}
                  disabled={disabled}
                  title={label}
                  className={`
                    px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1
                    ${config.clusterBy === value
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'
                    }
                    disabled:opacity-50
                  `}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Показ границ кластеров */}
          <button
            onClick={() => onChange({ showClusterHulls: !config.showClusterHulls })}
            disabled={disabled}
            title="Показать/скрыть границы кластеров"
            className={`
              px-2 py-0.5 rounded text-[10px] font-medium
              ${config.showClusterHulls !== false
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'
              }
              disabled:opacity-50
            `}
          >
            {config.showClusterHulls !== false ? '🛶 Hulls ON' : '⚫ Hulls OFF'}
          </button>
        </>
      )}

      {/* === Layered Controls === */}
      {mode === 'layered' && (
        <>
          {/* Направление слоёв */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-slate-500 uppercase">Direction:</span>
            <div className="flex gap-0.5">
              {LAYERED_DIRECTION_OPTIONS.map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => onChange({ layeredDirection: value })}
                  disabled={disabled}
                  title={label}
                  className={`
                    px-1.5 py-0.5 rounded text-[10px] font-medium
                    ${config.layeredDirection === value
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'
                    }
                    disabled:opacity-50
                  `}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TreeControls;
