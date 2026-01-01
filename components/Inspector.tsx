import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AiItem, AiItemSummary, AiItemType } from '../types';
import { getItemsListWithFallback, apiClient } from '../services/apiClient';
import { useGraphFilter } from '../lib/context/GraphFilterContext';
import { useDataCache } from '../lib/context/DataCacheContext';
import { L0SourceView, L1ConnectivityView, L2SemanticsView } from './tabs';
import NaturalQueryDialog from './NaturalQueryDialog';

interface InspectorProps {
  // Props are now optional since we fetch data internally
}

const Inspector: React.FC<InspectorProps> = () => {
  const { setFilteredItemIds, inspectorSearch, setInspectorSearch, filterHistory, clearHistory } = useGraphFilter();
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
  const { getItemsList, setItemsList: setCachedItemsList, currentContextCode } = useDataCache();
  const [itemsList, setItemsList] = useState<AiItemSummary[]>([]);
  const [fullItemData, setFullItemData] = useState<AiItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingFullData, setLoadingFullData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'L0' | 'L1' | 'L2'>('L1');
  const [dataSource, setDataSource] = useState<'cache' | 'server' | null>(null);
  const [isQueryDialogOpen, setIsQueryDialogOpen] = useState(false);

  // Храним предыдущий набор ID для сравнения
  const prevFilteredIdsRef = useRef<Set<string>>(new Set());

  // Отладка изменения поиска
  useEffect(() => {
    console.log('[Inspector] inspectorSearch changed to:', inspectorSearch);
  }, [inspectorSearch]);

  // Загрузка списка метаданных: сначала из кэша, затем с сервера
  useEffect(() => {
    const loadItemsList = async () => {
      console.log(`[Inspector] loadItemsList запущен для контекста: ${currentContextCode}`);

      // Проверяем кэш
      const cached = getItemsList();
      if (cached) {
        console.log(`[Inspector] Данные загружены из кэша:`, {
          count: cached.data.length,
          isDemo: cached.isDemo,
          cacheAge: `${((Date.now() - cached.timestamp) / 1000).toFixed(1)}s`
        });
        setItemsList(cached.data);
        setIsDemoMode(cached.isDemo);
        setDataSource('cache');
        setIsLoading(false);
        // Set first item as selected by default
        if (cached.data.length > 0 && !selectedId) {
          setSelectedId(cached.data[0].id);
        }
        return;
      }

      // Если кэш пуст - загружаем с сервера
      console.log(`[Inspector] Кэш пуст, загружаем с сервера...`);
      setIsLoading(true);
      setError(null);

      try {
        const result = await getItemsListWithFallback();
        console.log(`[Inspector] Данные получены с сервера:`, {
          count: result.data.length,
          isDemo: result.isDemo
        });

        // Сохраняем в кэш
        setCachedItemsList(result.data, result.isDemo);

        setItemsList(result.data);
        setIsDemoMode(result.isDemo);
        setDataSource('server');
        // Set first item as selected by default and load its full data
        if (result.data.length > 0) {
          setSelectedId(result.data[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch items list:', err);
        setError(err instanceof Error ? err.message : 'Failed to load items');
      } finally {
        setIsLoading(false);
      }
    };

    loadItemsList();
  }, [currentContextCode, getItemsList, setCachedItemsList]);

  // Функция загрузки полных данных элемента
  const loadFullItemData = async (itemId: string) => {
    setLoadingFullData(true);
    try {
      const fullData = await apiClient.getItem(itemId);
      setFullItemData(fullData);
    } catch (err) {
      console.error('Failed to load full item data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load item details');
    } finally {
      setLoadingFullData(false);
    }
  };

  // Загрузка полных данных при выборе элемента
  useEffect(() => {
    if (selectedId) {
      loadFullItemData(selectedId);
    } else {
      setFullItemData(null);
    }
  }, [selectedId]);

  // Мемоизируем filteredItems чтобы избежать пересоздания на каждый рендер
  // Поддержка regex: если поиск обёрнут в /.../ — используется регулярное выражение
  const filteredItems = useMemo(() => {
    const trimmedSearch = inspectorSearch.trim();

    // Проверяем, является ли это regex-паттерном: /pattern/ или /pattern/flags
    const regexMatch = trimmedSearch.match(/^\/(.+)\/([gimsuy]*)$/);

    if (regexMatch) {
      try {
        const regex = new RegExp(regexMatch[1], regexMatch[2] || 'i');
        return itemsList.filter(item =>
          regex.test(item.id) || regex.test(item.filePath)
        );
      } catch {
        // Невалидный regex — возвращаем пустой список
        return [];
      }
    }

    // Обычный поиск через includes
    const searchLower = trimmedSearch.toLowerCase();
    return itemsList.filter(item =>
      item.id.toLowerCase().includes(searchLower) ||
      item.filePath.toLowerCase().includes(searchLower)
    );
  }, [itemsList, inspectorSearch]);

  // Публикация отфильтрованных ID в контекст для синхронизации с графом
  // Обновляем только при реальном изменении списка ID
  useEffect(() => {
    const newIds = filteredItems.map((item: AiItemSummary) => item.id);
    const newIdsSet = new Set<string>(newIds);
    const prevIds = prevFilteredIdsRef.current;

    // Быстрая проверка: если размеры разные — точно изменилось
    if (prevIds.size !== newIds.length) {
      prevFilteredIdsRef.current = newIdsSet;
      setFilteredItemIds(newIdsSet);
      return;
    }

    // Проверяем содержимое
    let hasChanges = false;
    for (const id of newIds) {
      if (!prevIds.has(id)) {
        hasChanges = true;
        break;
      }
    }

    // Если изменений нет, не обновляем контекст
    if (!hasChanges) {
      return;
    }

    prevFilteredIdsRef.current = newIdsSet;
    setFilteredItemIds(newIdsSet);
  }, [filteredItems, setFilteredItemIds]);

  // Calculate Reverse Dependencies (Who uses me?)
  // Используем itemsList для поиска, но для отображения нужны только id
  const usedBy = useMemo(() => {
    if (!fullItemData) return [];
    return itemsList.filter(i => {
      // Проверяем, есть ли в l1_deps выбранного элемента
      return fullItemData.l1_deps.includes(i.id);
    });
  }, [fullItemData, itemsList]);

  const getBadgeColor = (type: string) => {
    switch (type) {
      case AiItemType.FUNCTION: return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case AiItemType.CLASS: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
      case AiItemType.INTERFACE: return 'bg-pink-500/20 text-pink-400 border-pink-500/50';
      case AiItemType.STRUCT: return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full bg-slate-900 items-center justify-center">
        <div className="text-slate-400">Loading inspector data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full bg-slate-900 items-center justify-center">
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-6">
          <h3 className="text-red-400 font-semibold mb-2">Error Loading Inspector</h3>
          <p className="text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-slate-900">
      {/* Left Sidebar: List */}
      <div className="w-80 border-r border-slate-700 flex flex-col bg-slate-800/50">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-white font-bold">Data Inspector</h2>
            <div className="flex items-center gap-2">
              {isDemoMode && (
                <span className="bg-amber-900/20 border border-amber-700/30 text-amber-400 text-xs px-2 py-1 rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  Demo
                </span>
              )}
              {dataSource === 'cache' && !isDemoMode && (
                <span className="bg-green-900/20 border border-green-700/30 text-green-400 text-xs px-2 py-1 rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  Cached
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search ID or File... (/regex/)"
                value={inspectorSearch}
                onChange={(e) => setInspectorSearch(e.target.value)}
                onFocus={() => setShowHistory(true)}
                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm text-white focus:border-blue-500 outline-none pr-8"
              />
              {filterHistory.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="absolute right-2 top-2 text-slate-500 hover:text-white"
                >
                  <svg className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {/* Выпадающий список истории */}
              {showHistory && filterHistory.length > 0 && (
                <div
                  ref={historyRef}
                  className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-2xl z-50 max-h-60 overflow-y-auto"
                >
                  <div className="px-2 py-1 border-b border-slate-700 flex justify-between items-center bg-slate-800/80">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Recent Filters</span>
                    <button onClick={clearHistory} className="text-[9px] text-red-400 hover:text-red-300">Clear</button>
                  </div>
                  {filterHistory.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInspectorSearch(h);
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
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded transition-colors flex items-center gap-1 shadow-lg shrink-0"
              title="Natural Language Query"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Query
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredItems.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`p-3 border-b border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors ${selectedId === item.id ? 'bg-blue-900/20 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'
                }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-slate-200 font-mono text-sm font-bold truncate w-48" title={item.id}>
                  {item.id}
                </span>
                <span className="text-[10px] uppercase text-slate-500">{item.language}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getBadgeColor(item.type)}`}>
                  {item.type}
                </span>
                <span className="text-xs text-slate-500 truncate">{item.filePath}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Content: Details */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loadingFullData ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Loading item details...
          </div>
        ) : fullItemData ? (
          <>
            {/* Header */}
            <div className="p-3 border-b border-slate-700 bg-slate-800">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-lg font-bold text-white font-mono">{fullItemData.id}</h1>
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider ${getBadgeColor(fullItemData.type)}`}>
                      {fullItemData.type}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">📄 {fullItemData.filePath}</span>
                    <span className="flex items-center gap-1">🌐 {fullItemData.language}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-700 bg-slate-800/50">
              {(['L0', 'L1', 'L2'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-900/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                >
                  {tab === 'L0' ? 'L0: Source Code' : tab === 'L1' ? 'L1: Connectivity' : 'L2: Semantics'}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-2 bg-slate-900">
              {activeTab === 'L0' && <L0SourceView item={fullItemData} />}
              {activeTab === 'L1' && <L1ConnectivityView item={fullItemData} usedBy={usedBy} onItemSelect={setSelectedId} />}
              {activeTab === 'L2' && <L2SemanticsView item={fullItemData} />}
            </div>
          </>
        ) : selectedId ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Loading item details...
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Select an item to inspect details
          </div>
        )}
      </div>
      <NaturalQueryDialog
        isOpen={isQueryDialogOpen}
        onClose={() => setIsQueryDialogOpen(false)}
        onApplyResult={(res) => setInspectorSearch(res)}
      />
    </div>
  );
};

export default Inspector;