import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { AiItemType, AiItem } from '../types';
import { getGraphWithFallback, GraphData, apiClient } from '../services/apiClient';
import { useGraphFilter } from '../lib/context/GraphFilterContext';
import { useDataCache } from '../lib/context/DataCacheContext';
import { L0SourceView, L1ConnectivityView, L2SemanticsView } from './tabs';
import NaturalQueryDialog from './NaturalQueryDialog';
import TagsDialog from './TagsDialog';

interface KnowledgeGraphProps {
  // Props are now optional since we fetch data internally
}

// ============ НАСТРОЙКИ ГРАФА ============
const GRAPH_SETTINGS = {
  /** Задержка появления tooltip при наведении на узел (мс) */
  TOOLTIP_DELAY_MS: 1000,
};

// Функция для форматирования времени с начала загрузки страницы
let pageLoadTime = performance.now();
const getTimeStamp = () => {
  const now = performance.now();
  const elapsed = now - pageLoadTime;
  const seconds = Math.floor(elapsed / 1000);
  const ms = (elapsed % 1000).toFixed(1);
  return `${seconds}.${ms.padStart(4, '0')}s`;
};

// Функция для форматирования абсолютного времени (реальное время)
const getAbsoluteTime = () => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
};

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = () => {
  const {
    filteredItemIds,
    setFilteredItemIds,
    graphSearch,
    setGraphSearch,
    inspectorSearch,
    filterHistory,
    clearHistory,
    typeFilterEnabled,
    selectedTypes,
    tagFilterEnabled,
    selectedTagCodes,
    setIsFilterDialogOpen
  } = useGraphFilter();
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  // Закрытие истории при клике вне
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { getGraph, setGraph, currentContextCode, getItemsList } = useDataCache();
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [dataSource, setDataSource] = useState<'cache' | 'server' | null>(null);
  const [focusedNodeIds, setFocusedNodeIds] = useState<Set<string>>(new Set());
  const [clickHistory, setClickHistory] = useState<string[]>([]);
  const [sessionClickHistory, setSessionClickHistory] = useState<string[]>([]);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isQueryDialogOpen, setIsQueryDialogOpen] = useState(false);
  const [hiddenLinkTypes, setHiddenLinkTypes] = useState<Set<string>>(new Set());
  const [showLegend, setShowLegend] = useState(false);

  // Состояния для модального окна деталей узла
  const [modalNodeId, setModalNodeId] = useState<string | null>(null);
  const [modalItemData, setModalItemData] = useState<AiItem | null>(null);
  const [loadingModalData, setLoadingModalData] = useState(false);
  const [modalActiveTab, setModalActiveTab] = useState<'L0' | 'L1' | 'L2'>('L1');

  const [modalItemTags, setModalItemTags] = useState<import('../types').Tag[]>([]);
  const [loadingModalTags, setLoadingModalTags] = useState(false);
  const [isTagsDialogOpen, setIsTagsDialogOpen] = useState(false);

  // Состояния для векторизации в модальном окне
  const [vectorizingModalItem, setVectorizingModalItem] = useState(false);
  const [modalItemIsVectorized, setModalItemIsVectorized] = useState(false);

  // Состояние для persistent tooltip (остаётся на экране до закрытия)
  const [tooltip, setTooltip] = useState<{
    node: { id: string; type: string; language: string; l2_desc?: string };
    x: number;
    y: number;
  } | null>(null);

  // Узел с «зелёным» выделением после тултипа — сбрасывается только при выборе другого узла (клик или новый тултип)
  const [lastTooltipHighlightedNodeId, setLastTooltipHighlightedNodeId] = useState<string | null>(null);

  // Состояние для перетаскивания Tooltip
  const [isDraggingTooltip, setIsDraggingTooltip] = useState(false);
  const dragStartRef = useRef<{ clientX: number, clientY: number, tooltipX: number, tooltipY: number } | null>(null);

  useEffect(() => {
    if (isDraggingTooltip) {
      const handleMouseMove = (e: MouseEvent) => {
        const startRef = dragStartRef.current;
        if (!startRef) return;
        const dx = e.clientX - startRef.clientX;
        const dy = e.clientY - startRef.clientY;
        setTooltip((prev) => {
          const current = dragStartRef.current;
          if (!prev || !current) return prev;
          return {
            ...prev,
            x: current.tooltipX + dx,
            y: current.tooltipY + dy
          };
        });
      };
      const handleMouseUp = () => {
        setIsDraggingTooltip(false);
        dragStartRef.current = null;
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingTooltip]);

  // Узел с зелёной обводкой: открытый тултип или последний узел с закрытым тултипом
  const greenHighlightNodeId = tooltip?.node?.id ?? lastTooltipHighlightedNodeId;

  const handleTooltipMouseDown = (e: React.MouseEvent) => {
    if (!tooltip) return;
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).closest('button')) return;
    setIsDraggingTooltip(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      tooltipX: tooltip.x,
      tooltipY: tooltip.y
    };
  };

  const availableLinkTypes = useMemo(() => {
    if (!graphData?.links) return [];
    const types = new Set<string>();
    for (const link of graphData.links) {
      const type = (link as any).label || (link as any).type;
      if (type) types.add(type);
    }
    return Array.from(types).sort();
  }, [graphData]);

  const toggleLinkType = (type: string) => {
    setHiddenLinkTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Функция открытия модального окна с деталями узла
  const openNodeModal = async (nodeId: string) => {
    setModalNodeId(nodeId);
    setLoadingModalData(true);
    setModalItemData(null);
    try {
      const fullData = await apiClient.getItem(nodeId);
      setModalItemData(fullData);
      setModalItemIsVectorized(fullData.isVectorized || false);
      loadModalItemTags(nodeId);
    } catch (err) {
      console.error('Failed to load node details:', err);
    } finally {
      setLoadingModalData(false);
    }
  };

  // Функция загрузки тегов для модального окна
  const loadModalItemTags = async (itemId: string) => {
    if (!itemId) {
      setModalItemTags([]);
      return;
    }
    setLoadingModalTags(true);
    try {
      const tagsRes = await apiClient.getItemTags(itemId);
      if (tagsRes.success) {
        setModalItemTags(tagsRes.tags || []);
      }
    } catch (err: any) {
      if (err.status === 404) {
        setModalItemTags([]);
      } else {
        console.error('Failed to load modal item tags:', err);
        setModalItemTags([]);
      }
    } finally {
      setLoadingModalTags(false);
    }
  };

  // Функция закрытия модального окна
  const closeNodeModal = () => {
    setModalNodeId(null);
    setModalItemData(null);
    setVectorizingModalItem(false);
  };

  // Функция векторизации элемента в модальном окне
  const handleVectorizeModalItem = async () => {
    if (!modalNodeId || !currentContextCode) return;

    setVectorizingModalItem(true);
    try {
      const result = await apiClient.vectorizeAiItems({
        fullNames: [modalNodeId],
        force: true,
        contextCode: currentContextCode,
      });

      setModalItemIsVectorized(true);
      console.log(`[KnowledgeGraph] Векторизован: ${modalNodeId} (${result.chunksUpdated} чанков)`);

      alert(`Векторизация выполнена: ${result.chunksUpdated} чанков обновлено`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка векторизации';
      console.error('[KnowledgeGraph] Ошибка векторизации:', msg);
      alert(`Ошибка векторизации: ${msg}`);
    } finally {
      setVectorizingModalItem(false);
    }
  };

  // Функция добавления узла в историю сессии (полная история)
  const addToSessionHistory = (nodeId: string) => {
    setSessionClickHistory(prev => {
      if (prev.includes(nodeId)) return prev;
      return [...prev, nodeId];
    });
  };

  // Функция удаления узла из истории сессии
  const removeFromSessionHistory = (nodeId: string) => {
    setSessionClickHistory(prev => prev.filter(id => id !== nodeId));
  };

  // Функция добавления узла в историю кликов (макс 5)
  const addToClickHistory = (nodeId: string) => {
    setClickHistory(prev => {
      const filtered = prev.filter(id => id !== nodeId);
      return [nodeId, ...filtered].slice(0, 5);
    });
  };

  // Функция для нахождения всех связанных узлов из ПОЛНОГО графа (без учета фильтра)
  const findRelatedNodes = (nodeId: string): Set<string> => {
    if (!graphData) return new Set([nodeId]);

    const relatedIds = new Set<string>([nodeId]);

    // Ищем все связи, где узел является source или target
    // graphData.links содержит оригинальные строковые ID (до обработки D3)
    for (const link of graphData.links) {
      // link.source и link.target - строки (до преобразования D3 force simulation)
      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

      if (sourceId === nodeId) {
        relatedIds.add(targetId);
      }
      if (targetId === nodeId) {
        relatedIds.add(sourceId);
      }
    }

    console.log(`[KnowledgeGraph] [${getTimeStamp()}] Ctrl+клик на ${nodeId}: найдено ${relatedIds.size} связанных узлов:`, Array.from(relatedIds));
    return relatedIds;
  };

  // Получает текущие отображаемые узлы для фиксации "ручного режима"
  const getEnsureVisibleSet = () => {
    if (filteredItemIds.size > 0) {
      return new Set(filteredItemIds);
    }
    const currentSet = new Set<string>();
    displayGraphData?.nodes.forEach(n => currentSet.add(n.id));
    return currentSet;
  };

  // Функция добавления всех зависящих узлов (кто вызывает данный узел)
  const addIncomingNodes = (nodeId: string) => {
    if (!graphData) return;
    const newFilteredIds = getEnsureVisibleSet();
    newFilteredIds.add(nodeId);
    let addedCount = 0;

    for (const link of graphData.links) {
      const linkType = (link as any).label || (link as any).type || '';
      if (hiddenLinkTypes.has(linkType)) continue;

      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

      if (targetId === nodeId) {
        newFilteredIds.add(sourceId);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      setFilteredItemIds(newFilteredIds);
      const newFocusSet = new Set(focusedNodeIds);
      newFocusSet.add(nodeId);
      setFocusedNodeIds(newFocusSet);
      console.log(`[KnowledgeGraph] Added ${addedCount} incoming nodes for ${nodeId}`);
    }
  };

  // Функция добавления всех узлов, от которых зависит данный узел (кого он вызывает)
  const addOutgoingNodes = (nodeId: string) => {
    if (!graphData) return;
    const newFilteredIds = getEnsureVisibleSet();
    newFilteredIds.add(nodeId);
    let addedCount = 0;

    for (const link of graphData.links) {
      const linkType = (link as any).label || (link as any).type || '';
      if (hiddenLinkTypes.has(linkType)) continue;

      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

      if (sourceId === nodeId) {
        newFilteredIds.add(targetId);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      setFilteredItemIds(newFilteredIds);
      const newFocusSet = new Set(focusedNodeIds);
      newFocusSet.add(nodeId);
      setFocusedNodeIds(newFocusSet);
      console.log(`[KnowledgeGraph] Added ${addedCount} outgoing nodes for ${nodeId}`);
    }
  };

  // Функция удаления всех вызывающих узлов с экрана
  const removeIncomingNodes = (nodeId: string) => {
    if (!graphData) return;
    const newFilteredIds = getEnsureVisibleSet();
    const newFocusSet = new Set<string>(focusedNodeIds);
    let removedCount = 0;

    for (const link of graphData.links) {
      const linkType = (link as any).label || (link as any).type || '';
      if (hiddenLinkTypes.has(linkType)) continue;

      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

      if (targetId === nodeId && sourceId !== nodeId) {
        if (newFilteredIds.has(sourceId)) {
          newFilteredIds.delete(sourceId);
          removedCount++;
        }
        if (newFocusSet.has(sourceId)) {
          newFocusSet.delete(sourceId);
        }
      }
    }

    if (removedCount > 0 || newFocusSet.size !== focusedNodeIds.size) {
      if (newFilteredIds.size === 0) newFilteredIds.add(nodeId); // Защита от пустого массива
      setFocusedNodeIds(newFocusSet);
      setFilteredItemIds(new Set(newFilteredIds)); // force reference update
      console.log(`[KnowledgeGraph] Removed ${removedCount} incoming nodes for ${nodeId}`);
    }
  };

  // Функция удаления всех вызываемых узлов с экрана
  const removeOutgoingNodes = (nodeId: string) => {
    if (!graphData) return;
    const newFilteredIds = getEnsureVisibleSet();
    const newFocusSet = new Set<string>(focusedNodeIds);
    let removedCount = 0;

    for (const link of graphData.links) {
      const linkType = (link as any).label || (link as any).type || '';
      if (hiddenLinkTypes.has(linkType)) continue;

      const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
      const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;

      if (sourceId === nodeId && targetId !== nodeId) {
        if (newFilteredIds.has(targetId)) {
          newFilteredIds.delete(targetId);
          removedCount++;
        }
        if (newFocusSet.has(targetId)) {
          newFocusSet.delete(targetId);
        }
      }
    }

    if (removedCount > 0 || newFocusSet.size !== focusedNodeIds.size) {
      if (newFilteredIds.size === 0) newFilteredIds.add(nodeId); // Защита от пустого массива
      setFocusedNodeIds(newFocusSet);
      setFilteredItemIds(new Set(newFilteredIds)); // force reference update
      console.log(`[KnowledgeGraph] Removed ${removedCount} outgoing nodes for ${nodeId}`);
    }
  };

  // Трассировка изменений filteredItemIds
  useEffect(() => {
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] filteredItemIds изменился:`, {
      size: filteredItemIds.size,
      ids: Array.from(filteredItemIds).slice(0, 5)
    });
  }, [filteredItemIds]);

  // Загрузка данных: сначала из кэша, затем с сервера если нужно
  useEffect(() => {
    const loadGraphData = async () => {
      const loadStart = performance.now();
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] loadGraphData запущен для контекста: ${currentContextCode}`);

      // Проверяем кэш
      const cached = getGraph();
      if (cached) {
        const cacheLoadTime = performance.now() - loadStart;
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Данные загружены из кэша за ${cacheLoadTime.toFixed(1)}ms:`, {
          nodes: cached.data.nodes.length,
          links: cached.data.links.length,
          isDemo: cached.isDemo,
          cacheAge: `${((Date.now() - cached.timestamp) / 1000).toFixed(1)}s`
        });
        setGraphData(cached.data);
        setIsDemoMode(cached.isDemo);
        setDataSource('cache');
        setIsLoading(false);
        return;
      }

      // Если кэш пуст - загружаем с сервера
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Кэш пуст, загружаем с сервера...`);
      setIsLoading(true);
      setError(null);

      try {
        const result = await getGraphWithFallback();
        const fetchEnd = performance.now();
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Данные получены с сервера за ${(fetchEnd - loadStart).toFixed(1)}ms:`, {
          nodes: result.data.nodes.length,
          links: result.data.links.length,
          isDemo: result.isDemo
        });

        // Сохраняем в кэш
        setGraph(result.data, result.isDemo);

        setGraphData(result.data);
        setIsDemoMode(result.isDemo);
        setDataSource('server');
      } catch (err) {
        console.error(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Failed to fetch graph data:`, err);
        setError(err instanceof Error ? err.message : 'Failed to load graph data');
      } finally {
        setIsLoading(false);
      }
    };

    loadGraphData();
  }, [currentContextCode, getGraph, setGraph]);

  // Трассировка изменений graphData
  useEffect(() => {
    if (graphData) {
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] graphData изменился:`, {
        nodes: graphData.nodes.length,
        links: graphData.links.length
      });
    }
  }, [graphData]);

  // Базовая фильтрация - теперь это просто мостик к полной базе данных,
  // чтобы не ломать логику зависимых useMemo, но мы убираем здесь жесткое ограничение
  const filteredGraphData = useMemo(() => {
    return graphData;
  }, [graphData]);

  // Дополнительная фильтрация по поисковому запросу
  const finalFilteredGraphData = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) return null;

    // 1. Подготавливаем регулярку для поиска в САМОМ ГРАФЕ
    let graphRegex: RegExp | null = null;
    if (graphSearch.trim()) {
      const escapeRegex = (str: string) => str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      const processText = (text: string): string => {
        let result = '';
        let j = 0;
        while (j < text.length) {
          if (text[j] === '~' && j + 1 < text.length && text[j + 1] !== '[') {
            const char = text[j + 1];
            result += `[^${escapeRegex(char)}]`;
            j += 2;
          } else if (text[j] === '*') {
            result += '.*';
            j++;
          } else {
            const char = text[j];
            if (/[.+?^${}()|[\]\\]/.test(char)) {
              result += '\\' + char;
            } else {
              result += char;
            }
            j++;
          }
        }
        return result;
      };

      let searchPattern = '';
      let i = 0;
      while (i < graphSearch.length) {
        if (graphSearch[i] === '~' && i + 1 < graphSearch.length && graphSearch[i + 1] === '[') {
          const excludeStart = i;
          i += 2;
          let sequence = '';
          while (i < graphSearch.length && graphSearch[i] !== ']') {
            if (graphSearch[i] === '\\' && i + 1 < graphSearch.length) {
              sequence += graphSearch[i] + graphSearch[i + 1];
              i += 2;
            } else if (graphSearch[i] !== ']') {
              sequence += graphSearch[i];
              i++;
            } else {
              break;
            }
          }
          if (i < graphSearch.length && graphSearch[i] === ']') {
            i++;
            const escapedSeq = escapeRegex(sequence);
            const textBefore = graphSearch.slice(0, excludeStart);
            const textAfter = graphSearch.slice(i);
            if (textBefore.length > 0 && textAfter.length > 0) {
              searchPattern += `${processText(textBefore)}(?!${escapedSeq})${processText(textAfter)}`;
              i = graphSearch.length;
            } else if (textBefore.length > 0) {
              searchPattern += `${processText(textBefore)}(?!${escapedSeq}).*`;
              i = graphSearch.length;
            } else if (textAfter.length > 0) {
              searchPattern += `(?<!${escapedSeq})${processText(textAfter)}`;
              i = graphSearch.length;
            } else {
              searchPattern += `(?!.*${escapedSeq})`;
            }
          }
        } else if (graphSearch[i] === '~') {
          if (i + 1 < graphSearch.length) {
            searchPattern += `[^${escapeRegex(graphSearch[i + 1])}]`;
            i += 2;
          } else {
            searchPattern += '\\~';
            i++;
          }
        } else if (graphSearch[i] === '*') {
          searchPattern += '.*';
          i++;
        } else {
          const char = graphSearch[i];
          if (char === '^' || char === '$' || char === '|') {
            searchPattern += char;
          } else {
            searchPattern += escapeRegex(char);
          }
          i++;
        }
      }

      try {
        const regexMatch = graphSearch.match(/^\/(.+)\/([gimsuy]*)$/);
        if (regexMatch) {
          graphRegex = new RegExp(regexMatch[1], regexMatch[2] || 'i');
        } else {
          graphRegex = new RegExp(searchPattern, 'i');
        }
      } catch {
        graphRegex = new RegExp(searchPattern, 'i');
      }
    }

    // 2. Подготавливаем регулярку для фильтра из ИНСПЕКТОРА
    let inspectorRegex: RegExp | null = null;
    if (inspectorSearch.trim()) {
      const trimmedSearch = inspectorSearch.trim();
      const regexMatch = trimmedSearch.match(/^\/(.+)\/([gimsuy]*)$/);
      try {
        if (regexMatch) {
          inspectorRegex = new RegExp(regexMatch[1], regexMatch[2] || 'i');
        } else {
          inspectorRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }
      } catch (e) {
        console.warn('[KnowledgeGraph] Invalid inspector search regex', e);
      }
    }

    // 3. Определяем соседей для автоматического показа только если нет ручного списка
    const alwaysShowIds = new Set<string>();

    // В ручном режиме фильтра (filteredItemIds задан) 
    // соседи не подтягиваются автоматически. 
    // Они подтягиваются в фокус только если активен обычный автофокус (без кастомного списка)
    if (focusedNodeIds.size > 0 && filteredItemIds.size === 0) {
      focusedNodeIds.forEach(id => alwaysShowIds.add(id));
      graphData.links.forEach(link => {
        const s = typeof link.source === 'string' ? link.source : (link.source as any).id;
        const t = typeof link.target === 'string' ? link.target : (link.target as any).id;
        if (focusedNodeIds.has(s)) alwaysShowIds.add(t);
        if (focusedNodeIds.has(t)) alwaysShowIds.add(s);
      });
    }

    // 3.5. Создаём lookup для тегов из itemsList (для фильтрации по тегам)
    const itemsListData = getItemsList();
    const itemTagsMap = new Map<string, Set<string>>();
    if (itemsListData?.data) {
      for (const item of itemsListData.data) {
        if (item.tags && item.tags.length > 0) {
          itemTagsMap.set(item.id, new Set(item.tags.map(t => t.code)));
        }
      }
    }

    // 4. ОСНОВНАЯ ФИЛЬТРАЦИЯ
    const filteredNodes = graphData.nodes.filter(node => {

      // РУЧНОЙ РЕЖИМ (filteredItemIds не пуст): отображаем ТОЛЬКО то, что в списке или сам узел из фокуса
      if (filteredItemIds.size > 0) {
        return filteredItemIds.has(node.id) || focusedNodeIds.has(node.id);
      }

      // Сфокусированные узлы и их соседи - всегда (они добавляются поверх) в авто-режиме
      if (alwaysShowIds.has(node.id)) return true;

      // АВТОМАТИЧЕСКИЙ РЕЖИМ (по фильтрам)
      if (graphRegex) {
        // Если поиска в самом графе - применяем его
        if (!graphRegex.test(node.id)) return false;
      } else if (inspectorSearch.trim()) {
        // Если поиска в графе нет, но есть фильтр в Инспекторе
        if (inspectorRegex && !inspectorRegex.test(node.id)) return false;
      }

      // Фильтр по типам
      if (typeFilterEnabled && selectedTypes.size > 0) {
        if (!selectedTypes.has(node.type)) return false;
      }

      // Фильтр по тегам
      if (tagFilterEnabled && selectedTagCodes.size > 0) {
        const nodeTags = itemTagsMap.get(node.id);
        if (!nodeTags || !Array.from(selectedTagCodes).some(code => nodeTags.has(code))) return false;
      }

      return true;
    });

    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = graphData.links.filter(link => {
      const linkType = (link as any).label || (link as any).type || '';
      if (hiddenLinkTypes.has(linkType)) return false;

      const s = typeof link.source === 'string' ? link.source : (link.source as any)?.id;
      const t = typeof link.target === 'string' ? link.target : (link.target as any)?.id;
      return s && t && s !== t && filteredNodeIds.has(s) && filteredNodeIds.has(t);
    });

    return {
      nodes: filteredNodes,
      links: filteredLinks
    };
  }, [graphData, graphSearch, focusedNodeIds, filteredItemIds, inspectorSearch, typeFilterEnabled, selectedTypes, tagFilterEnabled, selectedTagCodes, getItemsList, hiddenLinkTypes]);

  // Фильтрация при фокусе на узлах (двойной клик / Ctrl+клик) - ТЕПЕРЬ ОТКЛЮЧЕНА, 
  // так как мы хотим аддитивное поведение в finalFilteredGraphData
  const displayGraphData = finalFilteredGraphData;

  // Обновление обводки узлов: зелёный = открытый тултип или последний узел с закрытым тултипом
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl?.children?.length) return;
    const container = svgEl.children[1] as SVGGElement | undefined;
    if (!container?.children || container.children.length < 3) return;
    const nodeContainer = container.children[2];
    const yellowShades = ['#fbbf24', '#fcd34d', '#fde68a', '#fef08a', '#fef3c7'];
    const TOOLTIP_STROKE = '#22c55e';
    for (let i = 0; i < nodeContainer.children.length; i++) {
      const g = nodeContainer.children[i] as SVGGElement & { __data__?: { id: string } };
      const d = g.__data__;
      if (!d) continue;
      const shape = g.querySelector('rect, circle');
      if (!shape) continue;
      const isTooltipNode = greenHighlightNodeId != null && d.id === greenHighlightNodeId;
      let strokeColor: string;
      let strokeWidth: number;
      if (isTooltipNode) {
        strokeColor = TOOLTIP_STROKE;
        strokeWidth = 4;
      } else {
        const historyIndex = clickHistory.indexOf(d.id);
        strokeColor = historyIndex !== -1 ? yellowShades[historyIndex] : '#1e293b';
        strokeWidth = historyIndex !== -1 ? 4 : 2;
      }
      shape.setAttribute('stroke', strokeColor);
      shape.setAttribute('stroke-width', String(strokeWidth));
    }
  }, [greenHighlightNodeId, clickHistory, displayGraphData]);

  useEffect(() => {
    const renderStart = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useEffect отрисовки ЗАПУЩЕН`, {
      nodes: displayGraphData?.nodes.length,
      links: displayGraphData?.links.length
    });

    if (!svgRef.current || !displayGraphData || displayGraphData.nodes.length === 0) {
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useEffect: ранний выход`);
      return;
    }

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear previous render
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    // Use the filtered graph data
    const nodes = displayGraphData.nodes.map(d => ({ ...d }));
    const links = displayGraphData.links.map(d => ({ ...d }));

    // Add invisible background rect for panning (catches mouse events on empty space)
    // Must be first so it's under everything but still receives events on empty space
    const bgRect = svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "transparent")
      .style("cursor", "move")
      .style("pointer-events", "all");

    // Двойной клик по пустому месту сбрасывает фокус
    bgRect.on("dblclick", () => {
      setFocusedNodeIds(new Set());
    });

    // Create container group for zoom/pan transforms
    const container = svg.append("g");

    // Define Arrowhead (outside container so it doesn't scale)
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 8)           // средний размер, как просил
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#475569");

    const simulationStart = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Создание simulation`);

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody()
        .strength(-400)
        .theta(0.9)           // Barnes-Hut: O(n²) → O(n log n)
        .distanceMax(300))    // игнорировать узлы дальше 300px
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(40))
      .alphaDecay(0.05)       // быстрее затухание (default 0.0228)
      .alphaMin(0.001);       // раньше остановка

    const simulationCreated = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] simulation создан за ${(simulationCreated - simulationStart).toFixed(1)}ms`);

    // Draw lines inside container
    const link = container.append("g")
      .attr("stroke", "#475569")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrowhead)");

    // Draw link labels (use label or type from backend)
    // Бэкенд теперь передаёт реальные типы связей: calls, reads_from, updates и т.д.
    const getLinkLabel = (d: any) => d.label || d.type || '';
    const linkLabels = container.append("g")
      .selectAll("text")
      .data(links.filter((d: any) => getLinkLabel(d).length > 0))
      .join("text")
      .attr("fill", "#94a3b8")
      .attr("font-size", "11px")
      .attr("text-anchor", "middle")
      .attr("pointer-events", "none")
      .style("pointer-events", "none")
      .text((d: any) => getLinkLabel(d));

    // Draw Nodes inside container
    const node = container.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
      )
      .on("dblclick", (event: any, d: any) => {
        event.stopPropagation();
        addToClickHistory(d.id);
        addToSessionHistory(d.id);
        // Если кликнули по уже выбранному узлу - убираем его из фокуса
        if (focusedNodeIds.has(d.id)) {
          const newSet = new Set(focusedNodeIds);
          newSet.delete(d.id);
          setFocusedNodeIds(newSet);
        } else {
          // Двойной клик без Ctrl — заменяем фокус на один узел
          setFocusedNodeIds(new Set([d.id]));
        }
      })
      .on("click", (event: any, d: any) => {
        addToClickHistory(d.id);
        addToSessionHistory(d.id);
        setLastTooltipHighlightedNodeId(null);

        // Alt+клик — оставляем ТОЛЬКО этот узел и его связи (сброс остального фильтра)
        if (event.altKey) {
          event.stopPropagation();
          const relatedNodes = findRelatedNodes(d.id);

          setGraphSearch(''); // Сбрасываем поиск графа
          setFilteredItemIds(relatedNodes); // В инспекторе и на графе — только эти
          setFocusedNodeIds(new Set([d.id])); // В фокусе только он один
          return;
        }

        // Ctrl+клик — добавляем все связанные узлы к фильтру (из полного графа, без учета текущего фильтра)
        if (event.ctrlKey || event.metaKey) {
          event.stopPropagation();

          // Находим все связанные узлы из полного graphData
          const relatedNodes = findRelatedNodes(d.id);

          // Добавляем их к текущему фильтру
          const newFilteredIds = new Set<string>(filteredItemIds);
          for (const id of relatedNodes) {
            newFilteredIds.add(id);
          }

          console.log(`[KnowledgeGraph] [${getTimeStamp()}] Обновляем фильтр: было ${filteredItemIds.size}, стало ${newFilteredIds.size}`);
          setFilteredItemIds(newFilteredIds);

          // Также добавляем к фокусу для подсветки
          const newFocusSet = new Set(focusedNodeIds);
          newFocusSet.add(d.id);
          setFocusedNodeIds(newFocusSet);
        }
      });

    // Node Shapes - используем разные формы для разных типов
    // 5 уровней жёлтого: от яркого (последний клик) до бледного
    const yellowShades = ['#fbbf24', '#fcd34d', '#fde68a', '#fef08a', '#fef3c7'];

    // Функция для получения цвета по типу
    const getNodeColor = (type: string) => {
      switch (type) {
        case AiItemType.FUNCTION: return "#3b82f6"; // blue
        case AiItemType.CLASS: return "#10b981"; // emerald
        case AiItemType.METHOD: return "#a855f7"; // purple
        case AiItemType.MODULE: return "#14b8a6"; // teal
        case AiItemType.STRUCT: return "#f59e0b"; // amber (go)
        case AiItemType.INTERFACE: return "#ec4899"; // pink
        case AiItemType.TABLE: return "#06b6d4"; // cyan
        case AiItemType.TABLE_COLUMN: return "#6366f1"; // indigo
        default: return "#64748b";
      }
    };

    // Функция для получения цвета обводки
    const getStrokeColor = (nodeId: string) => {
      const historyIndex = clickHistory.indexOf(nodeId);
      if (historyIndex !== -1) {
        return yellowShades[historyIndex];
      }
      return "#1e293b";
    };

    // Функция для получения толщины обводки
    const getStrokeWidth = (nodeId: string) => {
      const historyIndex = clickHistory.indexOf(nodeId);
      return historyIndex !== -1 ? 4 : 2;
    };

    // Создаём узлы с разными формами в зависимости от типа
    node.each(function (d: any) {
      const el = d3.select(this);
      const fillColor = getNodeColor(d.type);
      const strokeColor = getStrokeColor(d.id);
      const strokeWidth = getStrokeWidth(d.id);

      if (d.type === AiItemType.TABLE) {
        // Таблицы - квадратики
        const size = 40; // размер квадрата (диаметр круга был 40)
        el.append("rect")
          .attr("width", size)
          .attr("height", size)
          .attr("x", -size / 2)
          .attr("y", -size / 2)
          .attr("fill", fillColor)
          .attr("stroke", strokeColor)
          .attr("stroke-width", strokeWidth);
      } else if (d.type === AiItemType.TABLE_COLUMN) {
        // Колонки - прямоугольники (ширина как у узлов, высота 1/3)
        const width = 40;
        const height = width / 3; // примерно 13.33
        el.append("rect")
          .attr("width", width)
          .attr("height", height)
          .attr("x", -width / 2)
          .attr("y", -height / 2)
          .attr("fill", fillColor)
          .attr("stroke", strokeColor)
          .attr("stroke-width", strokeWidth);
      } else {
        // Остальные типы - круги
        el.append("circle")
          .attr("r", 20)
          .attr("fill", fillColor)
          .attr("stroke", strokeColor)
          .attr("stroke-width", strokeWidth);
      }
    });

    // Labels
    node.append("text")
      .text(d => d.id.split('.').pop() || d.id)
      .attr("x", 25)
      .attr("y", 5)
      .attr("fill", "#cbd5e1")
      .attr("font-size", "12px")
      .style("pointer-events", "none")
      .style("text-shadow", "2px 2px 4px #000");

    // Persistent tooltip - показывается после удержания курсора неподвижно 1 сек, остаётся на экране до закрытия
    node
      .on("mouseenter", (event: any, d: any) => {
        if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);

        // Не запускаем таймер если зажата кнопка мыши (drag)
        if (event.buttons > 0) return;

        const nodeRef = { x: event.clientX, y: event.clientY };

        const startTimer = (clientX: number, clientY: number) => {
          return setTimeout(() => {
            const svgRect = svgRef.current?.getBoundingClientRect();
            if (svgRect) {
              setTooltip({
                node: { id: d.id, type: d.type, language: d.language, l2_desc: d.l2_desc },
                x: clientX - svgRect.left + 20,
                y: clientY - svgRect.top - 10
              });
              setLastTooltipHighlightedNodeId(d.id);
            }
          }, 1000);
        };

        tooltipTimeoutRef.current = startTimer(event.clientX, event.clientY);

        d3.select(event.currentTarget).on("mousemove.tooltip", (moveEvent: any) => {
          // Если зажата кнопка мыши — сбрасываем таймер и не перезапускаем
          if (moveEvent.buttons > 0) {
            if (tooltipTimeoutRef.current) {
              clearTimeout(tooltipTimeoutRef.current);
              tooltipTimeoutRef.current = null;
            }
            return;
          }
          const dx = moveEvent.clientX - nodeRef.x;
          const dy = moveEvent.clientY - nodeRef.y;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            nodeRef.x = moveEvent.clientX;
            nodeRef.y = moveEvent.clientY;
            if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
            tooltipTimeoutRef.current = startTimer(moveEvent.clientX, moveEvent.clientY);
          }
        });
      })
      .on("mouseleave", (event: any) => {
        d3.select(event.currentTarget).on("mousemove.tooltip", null);
        if (tooltipTimeoutRef.current) {
          clearTimeout(tooltipTimeoutRef.current);
          tooltipTimeoutRef.current = null;
        }
      });

    // Setup zoom and pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event: any) => {
        // For wheel: allow zoom without CTRL/CMD
        if (event.type === 'wheel') {
          return true;
        }
        // For mousedown: allow pan with left button only if clicking on background rect
        if (event.type === 'mousedown') {
          // Allow pan only if clicking on the background rect (not on nodes or links)
          return event.button === 0 && event.target === bgRect.node();
        }
        return true;
      })
      .on("zoom", (event) => {
        container.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    // Handle wheel events for zoom (без CTRL, чувствительность увеличена в 1.5 раза)
    svg.on("wheel.zoom", function (event: WheelEvent) {
      event.preventDefault();
      const point = d3.pointer(event, svgRef.current);
      // Чувствительность увеличена в 1.5 раза: 0.1 * 1.5 = 0.15
      const sensitivity = 0.15;
      const scale = event.deltaY > 0 ? (1 - sensitivity) : (1 + sensitivity);
      svg.transition()
        .duration(50)
        .call(zoom.scaleBy as any, scale, point);
    } as any);

    // Предварительный расчет позиций без DOM операций (прогрев)
    const warmupStart = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Прогрев simulation (50 тиков)`);
    simulation.tick(50);
    const warmupEnd = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Прогрев завершён за ${(warmupEnd - warmupStart).toFixed(1)}ms`);

    // Счётчики для логирования tick callback
    let tickCount = 0;
    let firstTickTime = performance.now();
    let lastTickTime = firstTickTime;
    let stabilizationLogged = false;

    simulation.on("tick", () => {
      tickCount++;
      const tickStart = performance.now();
      const alpha = simulation.alpha();
      const timeSinceLastTick = tickStart - lastTickTime;

      // Логируем первый тик
      if (tickCount === 1) {
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Первый tick callback, alpha=${alpha.toFixed(4)}`);
        firstTickTime = tickStart;
        lastTickTime = tickStart;
      }

      // Логируем большие интервалы между тиками (>50ms) - это может быть блокировка браузера
      if (tickCount > 1 && timeSinceLastTick > 50) {
        console.warn(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Большой интервал между тиками #${tickCount - 1} и #${tickCount}: ${timeSinceLastTick.toFixed(1)}ms`);
      }

      // Логируем первые 10 тиков для диагностики
      if (tickCount <= 10) {
        const timeSinceFirst = tickStart - firstTickTime;
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Tick #${tickCount}, alpha=${alpha.toFixed(4)}, время с первого: ${timeSinceFirst.toFixed(1)}ms, интервал: ${timeSinceLastTick.toFixed(1)}ms`);
      }
      // Логируем каждые 10 тиков
      else if (tickCount % 10 === 0) {
        const timeSinceFirst = tickStart - firstTickTime;
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Tick #${tickCount}, alpha=${alpha.toFixed(4)}, время с первого: ${timeSinceFirst.toFixed(1)}ms, интервал: ${timeSinceLastTick.toFixed(1)}ms`);
      }

      // Логируем стабилизацию только один раз
      if (!stabilizationLogged && alpha <= 0.001) {
        const totalTickTime = tickStart - firstTickTime;
        console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Симуляция стабилизирована после ${tickCount} тиков (alpha=${alpha.toFixed(4)}), общее время тиков: ${totalTickTime.toFixed(1)}ms`);
        stabilizationLogged = true;
      }

      lastTickTime = tickStart;

      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      // Update link labels position (middle of the link)
      linkLabels
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);

      const tickEnd = performance.now();
      // Логируем медленные тики (>5ms)
      if (tickEnd - tickStart > 5) {
        console.warn(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Медленный tick #${tickCount}: ${(tickEnd - tickStart).toFixed(1)}ms`);
      }
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();

      // Сбрасываем таймер тултипа — при drag тултип не нужен
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
        tooltipTimeoutRef.current = null;
      }

      // Convert screen coordinates to graph coordinates considering zoom/pan
      const pointer = d3.pointer(event, container.node());
      d.fx = pointer[0];
      d.fy = pointer[1];

      // Prevent pan when dragging node
      event.sourceEvent.stopPropagation();
    }

    function dragged(event: any, d: any) {
      // Convert screen coordinates to graph coordinates considering zoom/pan
      const pointer = d3.pointer(event, container.node());
      d.fx = pointer[0];
      d.fy = pointer[1];
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Логирование завершения отрисовки (только создание, не работа симуляции)
    const renderEnd = performance.now();
    console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] useEffect отрисовки завершён за ${(renderEnd - renderStart).toFixed(1)}ms (создание симуляции, тики выполняются асинхронно)`);

    // Cleanup: остановить симуляцию при размонтировании или смене данных
    return () => {
      console.log(`[KnowledgeGraph] [${getTimeStamp()}] [${getAbsoluteTime()}] Cleanup: остановка симуляции`);
      simulation.stop();
    };
  }, [displayGraphData, clickHistory]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <h2 className="text-lg font-bold text-white">Dependency Graph (L1)</h2>
        </div>
        <div className="flex-1 bg-slate-900 flex items-center justify-center">
          <div className="text-slate-400">Loading dependency graph...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
          <h2 className="text-lg font-bold text-white">Dependency Graph (L1)</h2>
        </div>
        <div className="flex-1 bg-slate-900 flex items-center justify-center">
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-6 m-4">
            <h3 className="text-red-400 font-semibold mb-2">Error Loading Graph</h3>
            <p className="text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      <div className="p-2 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white">Dependency Graph (L1)</h2>
          {isDemoMode && (
            <span className="bg-amber-900/20 border border-amber-700/30 text-amber-400 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
              Demo
            </span>
          )}
          {dataSource === 'cache' && !isDemoMode && (
            <span className="bg-green-900/20 border border-green-700/30 text-green-400 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-green-500"></span>
              Cached
            </span>
          )}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter graph... (e.g. ^carl_.*|auth_.*)"
              value={graphSearch}
              onChange={(e) => {
                setGraphSearch(e.target.value);
                if (filteredItemIds.size > 0) setFilteredItemIds(new Set());
              }}
              onFocus={() => setShowHistory(true)}
              className="bg-slate-900 border border-slate-600 rounded px-3 py-1 text-sm text-white focus:border-blue-500 outline-none w-64 shadow-inner pr-8"
            />
            {filterHistory.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="absolute right-2 top-1.5 text-slate-500 hover:text-white"
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}

            {/* Выпадающий список истории */}
            {showHistory && filterHistory.length > 0 && (
              <div
                ref={historyRef}
                className="absolute top-full right-0 mt-1 w-80 bg-slate-800 border border-slate-700 rounded shadow-2xl z-[150] max-h-60 overflow-y-auto"
              >
                <div className="px-2 py-1 border-b border-slate-700 flex justify-between items-center bg-slate-800/80">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Recent Filters</span>
                  <button onClick={clearHistory} className="text-[9px] text-red-400 hover:text-red-300">Clear</button>
                </div>
                {filterHistory.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setGraphSearch(h);
                      setShowHistory(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white border-b border-slate-700/50 last:border-0 truncate font-mono"
                    title={h}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setIsQueryDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-lg shadow-blue-900/20"
            title="Natural Language Query"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Query
          </button>
          <button
            onClick={() => setIsFilterDialogOpen(true)}
            className={`text-[10px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-lg ${(typeFilterEnabled && selectedTypes.size > 0) || (tagFilterEnabled && selectedTagCodes.size > 0)
              ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
              : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
            title="Фильтры по типам и тегам"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filter
          </button>
          {focusedNodeIds.size > 0 && (
            <div className="flex items-center gap-1">
              <span className="bg-blue-900/30 border border-blue-700/30 text-blue-400 text-[10px] px-1.5 py-0.5 rounded flex flex-col gap-0.5 max-h-[3em] overflow-y-auto">
                <span className="shrink-0">Focus:</span>
                <span className="break-words">{Array.from(focusedNodeIds).map((id: string) => id.split('.').pop()).join(', ')}</span>
              </span>
              <button
                onClick={() => setFocusedNodeIds(new Set())}
                className="text-slate-400 hover:text-white text-[10px] px-0.5"
                title="Сбросить фокус"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        {availableLinkTypes.length > 0 && (
          <div className="flex gap-3 text-[11px] flex-wrap mt-2 items-center">
            <span className="text-slate-400 font-bold mr-1">Links:</span>
            {availableLinkTypes.map(type => (
              <label key={type} className="flex items-center gap-1 cursor-pointer hover:text-white text-slate-300">
                <input
                  type="checkbox"
                  checked={!hiddenLinkTypes.has(type)}
                  onChange={() => toggleLinkType(type)}
                  className="w-3 h-3 accent-blue-500 rounded bg-slate-700 border-slate-600 focus:ring-blue-600"
                />
                {type}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 flex overflow-hidden relative">
        {/* Graph area */}
        <div className="flex-1 bg-slate-900 overflow-hidden relative">
          <svg ref={svgRef} className="w-full h-full cursor-move"></svg>

          {/* Nodes Legend */}
          <div className="absolute bottom-4 right-4 z-[40]">
            {showLegend ? (
              <div className="bg-slate-800 border border-slate-600 rounded shadow-2xl p-2 text-[10px] min-w-[120px]">
                <div className="flex justify-between items-center mb-1 border-b border-slate-700 pb-1">
                  <span className="font-bold text-slate-300">Legend</span>
                  <button onClick={() => setShowLegend(false)} className="text-slate-500 hover:text-white px-1">✕</button>
                </div>
                <div className="flex flex-col gap-1.5 p-1 text-slate-300">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div> Func</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div> Class</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div> Method</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-teal-500"></div> Module</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div> Struct</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-pink-500"></div> Interface</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-cyan-500"></div> Table</div>
                  <div className="flex items-center gap-1.5"><div className="w-4 h-1 bg-indigo-500"></div> Column</div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowLegend(true)}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 px-3 py-1.5 rounded shadow-lg text-[10px] font-bold flex items-center gap-1"
              >
                Legend
              </button>
            )}
          </div>

          {/* Persistent Tooltip - остаётся на экране до закрытия */}
          {tooltip && (
            <div
              className={`absolute bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-2xl z-50 min-w-[200px] max-w-[350px] ${isDraggingTooltip ? 'cursor-grabbing' : 'cursor-grab'}`}
              style={{ left: tooltip.x, top: tooltip.y, userSelect: 'none' }}
              onMouseDown={handleTooltipMouseDown}
            >
              {/* Кнопки в правом верхнем углу (вертикально) */}
              <div className="absolute top-1 right-1 flex flex-col items-center gap-0.5">
                <button
                  onClick={() => setTooltip(null)}
                  className="text-slate-400 hover:text-white text-sm px-1.5 py-0.5 rounded hover:bg-slate-700"
                  title="Закрыть"
                >
                  ✕
                </button>
                <button
                  onClick={() => {
                    openNodeModal(tooltip.node.id);
                    setTooltip(null);
                  }}
                  className="text-slate-400 hover:text-blue-400 text-sm px-1.5 py-0.5 rounded hover:bg-slate-700"
                  title="Открыть карточку"
                >
                  ⋯
                </button>
              </div>
              <div className="text-xs space-y-1.5 pr-6">
                <div className="flex items-start gap-2">
                  <span className="text-slate-500 shrink-0">ID:</span>
                  <span className="text-white font-mono break-all">{tooltip.node.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Type:</span>
                  <span className="text-blue-400">{tooltip.node.type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Lang:</span>
                  <span className="text-green-400">{tooltip.node.language}</span>
                </div>
                {tooltip.node.l2_desc && (
                  <div className="flex flex-col gap-1">
                    <span className="text-slate-500 shrink-0">Desc:</span>
                    <div
                      className="text-slate-300 bg-slate-900/50 rounded p-1.5 overflow-y-auto text-[11px] leading-relaxed"
                      style={{ maxHeight: 'calc(1.625em * 5)', minHeight: '1.625em' }}
                    >
                      {tooltip.node.l2_desc}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-2 border-t border-slate-700 pt-2 shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => addIncomingNodes(tooltip.node.id)}
                    className="flex-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded shadow text-center font-bold"
                    title="Добавить на экран всех, кто вызывает (использует) этот узел"
                  >
                    ← Callers
                  </button>
                  <button
                    onClick={() => addOutgoingNodes(tooltip.node.id)}
                    className="flex-1 text-[10px] bg-teal-600 hover:bg-teal-500 text-white px-2 py-1 rounded shadow text-center font-bold"
                    title="Добавить на экран всех, кого вызывает данный узел"
                  >
                    Callees →
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => removeIncomingNodes(tooltip.node.id)}
                    className="flex-1 text-[10px] bg-slate-700 hover:bg-red-900/40 text-slate-300 hover:text-red-200 border border-slate-600 px-2 py-1 rounded shadow text-center"
                    title="Убрать с экрана текущих вызывающих этого узла"
                  >
                    x Callers
                  </button>
                  <button
                    onClick={() => removeOutgoingNodes(tooltip.node.id)}
                    className="flex-1 text-[10px] bg-slate-700 hover:bg-red-900/40 text-slate-300 hover:text-red-200 border border-slate-600 px-2 py-1 rounded shadow text-center"
                    title="Убрать с экрана текущие узлы, которые вызываются этим узлом"
                  >
                    Callees x
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right panel - Session History */}
        <div className={`bg-slate-800 border-l border-slate-700 flex flex-col transition-all duration-200 ${isRightPanelCollapsed ? 'w-6' : 'w-48'}`}>
          {/* Collapse toggle */}
          <button
            onClick={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 border-b border-slate-700 text-[10px]"
            title={isRightPanelCollapsed ? 'Развернуть' : 'Свернуть'}
          >
            {isRightPanelCollapsed ? '◀' : '▶'}
          </button>

          {!isRightPanelCollapsed && (
            <>
              {/* Header */}
              <div className="p-2 border-b border-slate-700">
                <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Session Clicks</h3>
                <span className="text-[10px] text-slate-500">{sessionClickHistory.length} items</span>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-1">
                {sessionClickHistory.length === 0 ? (
                  <p className="text-[10px] text-slate-500 italic p-1">No clicks yet</p>
                ) : (
                  sessionClickHistory.map((nodeId, idx) => (
                    <div
                      key={`${nodeId}-${idx}`}
                      className="flex items-center justify-between gap-1 p-1 hover:bg-slate-700 rounded group"
                    >
                      <button
                        onClick={() => openNodeModal(nodeId)}
                        className="text-[10px] text-slate-300 hover:text-blue-400 font-mono truncate flex-1 text-left"
                        title={nodeId}
                      >
                        {nodeId.split('.').pop()}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFromSessionHistory(nodeId); }}
                        className="text-slate-500 hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Удалить"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom panel with buttons */}
              <div className="p-2 border-t border-slate-700 space-y-1">
                <button
                  className="w-full px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] rounded transition-colors"
                  title="Build Logic"
                >
                  Build Logic
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal for node details */}
      {modalNodeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeNodeModal}>
          <div
            className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-[80vw] h-[80vh] max-w-4xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            {/* Modal Header */}
            <div className="p-3 border-b border-slate-700 flex justify-between items-start">
              <div className="flex-1">
                {modalItemData ? (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-base font-bold text-white font-mono">{modalItemData.id}</h2>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider bg-blue-900/30 border-blue-700/30 text-blue-400">
                        {modalItemData.type}
                      </span>
                      <button
                        onClick={() => setIsTagsDialogOpen(true)}
                        className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-0.5 rounded transition-colors font-bold"
                        title="Управление тегами"
                      >
                        T
                      </button>
                      <button
                        onClick={handleVectorizeModalItem}
                        disabled={vectorizingModalItem}
                        className={`text-xs px-2 py-0.5 rounded transition-colors font-bold ${modalItemIsVectorized
                          ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                          : 'bg-slate-600 hover:bg-cyan-600 text-slate-300 hover:text-white'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={modalItemIsVectorized ? 'Векторизован. Нажмите для перевекторизации' : 'Векторизовать'}
                      >
                        {vectorizingModalItem ? '...' : 'V'}
                      </button>
                    </div>
                    <div className="flex gap-3 text-[10px] text-slate-400 mb-2">
                      <span>📄 {modalItemData.filePath}</span>
                      <span>🌐 {modalItemData.language}</span>
                    </div>
                    {/* Теги */}
                    {loadingModalTags ? (
                      <div className="text-[10px] text-slate-500">Загрузка тегов...</div>
                    ) : modalItemTags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {modalItemTags.map(tag => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/50 rounded text-[10px] font-mono"
                            title={tag.description || undefined}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 italic">Теги отсутствуют</div>
                    )}
                  </>
                ) : (
                  <h2 className="text-base font-bold text-white font-mono">{modalNodeId}</h2>
                )}
              </div>
              <button
                onClick={closeNodeModal}
                className="text-slate-400 hover:text-white text-lg px-2"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-700 bg-slate-800/50">
              {(['L0', 'L1', 'L2'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setModalActiveTab(tab)}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${modalActiveTab === tab
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-900/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                >
                  {tab === 'L0' ? 'L0: Source Code' : tab === 'L1' ? 'L1: Connectivity' : 'L2: Semantics'}
                </button>
              ))}
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-3 bg-slate-900">
              {loadingModalData ? (
                <div className="flex items-center justify-center h-full text-slate-400">
                  Loading...
                </div>
              ) : modalItemData ? (
                <>
                  {modalActiveTab === 'L0' && <L0SourceView item={modalItemData} />}
                  {modalActiveTab === 'L1' && <L1ConnectivityView item={modalItemData} usedBy={[]} />}
                  {modalActiveTab === 'L2' && <L2SemanticsView item={modalItemData} showEmbeddings={false} />}
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  Failed to load data
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <NaturalQueryDialog
        isOpen={isQueryDialogOpen}
        onClose={() => setIsQueryDialogOpen(false)}
        onApplyResult={(res) => setGraphSearch(res)}
      />
      <TagsDialog
        isOpen={isTagsDialogOpen && !!modalNodeId}
        onClose={() => {
          setIsTagsDialogOpen(false);
          // Перезагружаем теги после закрытия диалога
          if (modalNodeId) {
            loadModalItemTags(modalNodeId);
          }
        }}
        itemId={modalNodeId || ''}
      />
    </div>
  );
};

export default KnowledgeGraph;