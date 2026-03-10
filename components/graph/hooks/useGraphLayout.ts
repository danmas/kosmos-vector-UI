/**
 * useGraphLayout - Хук для управления layout engine'ами графа
 * Переключает между Force, Call Tree, Project Tree и Clustered layout'ами
 */

import { useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { GraphLayoutMode, LayoutEngine, LayoutConfig, LayoutCallbacks, GraphNode, GraphLink } from '../types';
import { CallTreeLayout } from '../layouts/CallTreeLayout';
import { ProjectTreeLayout } from '../layouts/ProjectTreeLayout';
import { ClusteredLayout } from '../layouts/ClusteredLayout';

interface UseGraphLayoutOptions {
  /** SVG ref для графа */
  svgRef: React.RefObject<SVGSVGElement>;
  /** Контейнер (g element) для графа */
  containerRef: React.RefObject<d3.Selection<SVGGElement, unknown, null, undefined>>;
  /** Текущий режим layout'а */
  mode: GraphLayoutMode;
  /** Конфигурация layout'а */
  config: LayoutConfig;
  /** Данные графа */
  nodes: GraphNode[];
  links: GraphLink[];
  /** Колбэки для взаимодействия с узлами */
  callbacks: LayoutCallbacks;
  /** Включён ли tree layout (не force) */
  enabled: boolean;
}

interface UseGraphLayoutResult {
  /** Текущий layout engine */
  layoutEngine: LayoutEngine | null;
  /** Принудительное обновление layout'а */
  forceUpdate: () => void;
  /** Сброс позиций */
  resetPositions: () => void;
}

/**
 * Хук для управления альтернативными layout'ами (Call Tree, Project Tree)
 * Force layout управляется отдельно в KnowledgeGraph.tsx
 */
export const useGraphLayout = ({
  svgRef,
  containerRef,
  mode,
  config,
  nodes,
  links,
  callbacks,
  enabled,
}: UseGraphLayoutOptions): UseGraphLayoutResult => {
  const layoutEngineRef = useRef<LayoutEngine | null>(null);
  const prevModeRef = useRef<GraphLayoutMode>(mode);

  // Создание/переключение layout engine при смене режима
  useEffect(() => {
    console.log(`[useGraphLayout] mode=${mode}, enabled=${enabled}`);
    
    // Если режим force или layout отключён - очищаем engine
    if (mode === 'force' || !enabled) {
      if (layoutEngineRef.current) {
        console.log(`[useGraphLayout] Destroying layout engine`);
        layoutEngineRef.current.destroy();
        layoutEngineRef.current = null;
      }
      return;
    }

    const svg = svgRef.current;
    const container = containerRef.current;
    
    if (!svg || !container) {
      console.log(`[useGraphLayout] svg or container not ready`, { svg: !!svg, container: !!container });
      return;
    }

    const width = svg.clientWidth;
    const height = svg.clientHeight;

    // Если режим изменился - пересоздаём engine
    if (prevModeRef.current !== mode && layoutEngineRef.current) {
      layoutEngineRef.current.destroy();
      layoutEngineRef.current = null;
    }

    // Создаём новый engine если нужно
    if (!layoutEngineRef.current) {
      console.log(`[useGraphLayout] Creating new layout engine for mode: ${mode}`);
      if (mode === 'call-tree') {
        layoutEngineRef.current = new CallTreeLayout();
      } else if (mode === 'project-tree') {
        layoutEngineRef.current = new ProjectTreeLayout();
      } else if (mode === 'clustered') {
        layoutEngineRef.current = new ClusteredLayout();
      }

      if (layoutEngineRef.current) {
        // Очищаем контейнер от force layout элементов
        container.selectAll('*').remove();
        
        layoutEngineRef.current.init(container, width, height);
      }
    }

    prevModeRef.current = mode;

    // Cleanup
    return () => {
      // Не удаляем engine при unmount - он может понадобиться
    };
  }, [mode, enabled, svgRef, containerRef]);

  // Обновление layout при изменении данных или конфигурации
  useEffect(() => {
    if (!layoutEngineRef.current || mode === 'force' || !enabled) {
      return;
    }

    console.log(`[useGraphLayout] Updating layout: ${nodes.length} nodes, ${links.length} links`);
    layoutEngineRef.current.update(nodes, links, config, callbacks);
  }, [nodes, links, config, callbacks, mode, enabled]);

  // Принудительное обновление
  const forceUpdate = useCallback(() => {
    if (!layoutEngineRef.current || mode === 'force' || !enabled) return;

    layoutEngineRef.current.update(nodes, links, config, callbacks);
  }, [nodes, links, config, callbacks, mode, enabled]);

  // Сброс позиций
  const resetPositions = useCallback(() => {
    if (layoutEngineRef.current?.resetPositions) {
      layoutEngineRef.current.resetPositions();
    }
  }, []);

  return {
    layoutEngine: layoutEngineRef.current,
    forceUpdate,
    resetPositions,
  };
};

export default useGraphLayout;
