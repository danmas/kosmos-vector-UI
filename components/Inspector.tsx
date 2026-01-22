import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AiItem, AiItemSummary, AiItemType } from '../types';
import { getItemsListWithFallback, apiClient } from '../services/apiClient';
import { useGraphFilter } from '../lib/context/GraphFilterContext';
import { useDataCache } from '../lib/context/DataCacheContext';
import { L0SourceView, L1ConnectivityView, L2SemanticsView } from './tabs';
import NaturalQueryDialog from './NaturalQueryDialog';
import TagsDialog from './TagsDialog';

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

  const [isTagsDialogOpen, setIsTagsDialogOpen] = useState(false);
  const [itemTags, setItemTags] = useState<import('../types').Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [extractingColumns, setExtractingColumns] = useState(false);

  // Храним предыдущий набор ID для сравнения
  const prevFilteredIdsRef = useRef<Set<string>>(new Set());
  
  // Ref для отслеживания контекста, с которым был выбран элемент
  const selectedIdContextRef = useRef<string | null>(null);

  const { typeFilterEnabled, selectedTypes, tagFilterEnabled, selectedTagCodes, setIsFilterDialogOpen } = useGraphFilter();


  
  // Отладка изменения поиска
  useEffect(() => {
    console.log('[Inspector] inspectorSearch changed to:', inspectorSearch);
  }, [inspectorSearch]);

  // Загрузка списка метаданных: сначала из кэша, затем с сервера
  useEffect(() => {
    // Очищаем выбранный элемент и список при смене контекста
    setSelectedId(null);
    setFullItemData(null);
    setItemsList([]); // Важно: очищаем список, чтобы старые элементы не проходили проверку
    
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
        if (cached.data.length > 0) {
          selectedIdContextRef.current = currentContextCode;
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
          selectedIdContextRef.current = currentContextCode;
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

  // Функция загрузки тегов элемента
  const loadItemTags = async (itemId: string) => {
    if (!itemId || itemId.trim() === '') {
      setItemTags([]);
      return;
    }

    setLoadingTags(true);
    try {
      const tagsRes = await apiClient.getItemTags(itemId);
      if (tagsRes.success) {
        setItemTags(tagsRes.tags || []);
      }
    } catch (err: any) {
      // 404 - это нормально, если у AI Item еще нет тегов
      if (err.status === 404) {
        setItemTags([]);
      } else {
        console.error('Failed to load item tags:', err);
        setItemTags([]);
      }
    } finally {
      setLoadingTags(false);
    }
  };

  // Функция извлечения колонок из SQL-функции
  const handleExtractColumns = async () => {
    if (!fullItemData || fullItemData.language !== 'sql') {
      return;
    }

    setExtractingColumns(true);
    try {
      const response = await apiClient.extractColumns(fullItemData.id);
      if (response.success) {
        const report = response.report;
        const message = `Извлечено колонок: ${report.columnsFound}\n` +
          `Резолвлено: ${report.columnsResolved}\n` +
          `Нерезолвлено: ${report.columnsUnresolved}\n` +
          `Создано связей: ${report.linksCreated}`;
        alert(message);
        console.log('Column extraction result:', report);
      } else {
        alert('Ошибка при извлечении колонок');
      }
    } catch (err) {
      console.error('Failed to extract columns:', err);
      alert(err instanceof Error ? err.message : 'Ошибка при извлечении колонок');
    } finally {
      setExtractingColumns(false);
    }
  };

  // Функция локального обновления тегов в списке
  const updateItemTagsInList = (itemId: string, newTags: import('../types').TagSummary[]) => {
    setItemsList(prevList => {
      const updatedList = prevList.map(item => 
        item.id === itemId 
          ? { ...item, tags: newTags }
          : item
      );
      // Обновляем кэш с актуальным списком
      setCachedItemsList(updatedList, isDemoMode);
      return updatedList;
    });
  };

  // Функция массового обновления тегов в списке
  const updateMultipleItemsTags = (updates: Map<string, import('../types').TagSummary[]>) => {
    setItemsList(prevList => {
      const updatedList = prevList.map(item => {
        const newTags = updates.get(item.id);
        return newTags !== undefined ? { ...item, tags: newTags } : item;
      });
      // Обновляем кэш один раз с полностью актуальным списком
      setCachedItemsList(updatedList, isDemoMode);
      return updatedList;
    });
  };

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

  // // Загрузка полных данных при выборе элемента
  // useEffect(() => {
  //   // Проверяем, что элемент существует в текущем списке (принадлежит текущему контексту)
  //   // И что контекст не изменился с момента выбора элемента
  //   if (selectedId && itemsList.length > 0) {
  //     // Проверяем, что контекст совпадает с тем, при котором был выбран элемент
  //     if (selectedIdContextRef.current !== currentContextCode) {
  //       console.log(`[Inspector] Context mismatch: selectedId from "${selectedIdContextRef.current}", current is "${currentContextCode}", skipping load`);
  //       return;
  //     }
      
  //     const existsInCurrentContext = itemsList.some(item => item.id === selectedId);
  //     if (existsInCurrentContext) {
  //       loadFullItemData(selectedId);
  //     } else {
  //       // Элемент из другого контекста — сбрасываем выбор
  //       console.log(`[Inspector] Selected item "${selectedId}" not found in current context, resetting...`);
  //       setSelectedId(null);
  //       setFullItemData(null);
  //     }
  //   } else if (!selectedId) {
  //     setFullItemData(null);
  //   }
  // }, [selectedId, itemsList, currentContextCode]);

  // Загрузка полных данных при выборе элемента
  useEffect(() => {
    // Пропускаем проверку для специальных ID массовых операций
    if (selectedId === 'bulk-add' || selectedId === 'bulk-remove') {
      return;
    }

    if (selectedId && itemsList.length > 0) {
      if (selectedIdContextRef.current !== currentContextCode) {
        console.log(`[Inspector] Context mismatch: selectedId from "${selectedIdContextRef.current}", current is "${currentContextCode}", skipping load`);
        return;
      }
      
      const existsInCurrentContext = itemsList.some(item => item.id === selectedId);
      if (existsInCurrentContext) {
        loadFullItemData(selectedId);
        loadItemTags(selectedId);
      } else {
        console.log(`[Inspector] Selected item "${selectedId}" not found in current context, resetting...`);
        setSelectedId(null);
        setFullItemData(null);
        setItemTags([]);
      }
    } else if (!selectedId) {
      setFullItemData(null);
      setItemTags([]);
    }
  }, [selectedId, itemsList, currentContextCode]);
  

  // Мемоизируем filteredItems с поддержкой regex, типов и тегов
  const filteredItems = useMemo(() => {
    let items = itemsList;

    // Фильтр по типам
    if (typeFilterEnabled && selectedTypes.size > 0) {
      items = items.filter(item => selectedTypes.has(item.type));
    }

    // Фильтр по тегам
    if (tagFilterEnabled && selectedTagCodes.size > 0) {
      items = items.filter(item =>
        item.tags?.some(tag => selectedTagCodes.has(tag.code))
      );
    }

    // Фильтр по поиску (regex или обычный)
    const trimmedSearch = inspectorSearch.trim();
    if (trimmedSearch) {
      const regexMatch = trimmedSearch.match(/^\/(.+)\/([gimsuy]*)$/);

      if (regexMatch) {
        try {
          const regex = new RegExp(regexMatch[1], regexMatch[2] || 'i');
          items = items.filter(item =>
            regex.test(item.id) || regex.test(item.filePath)
          );
        } catch {
          // Невалидный regex — возвращаем пустой список
          return [];
        }
      } else {
        const searchLower = trimmedSearch.toLowerCase();
        items = items.filter(item =>
          item.id.toLowerCase().includes(searchLower) ||
          item.filePath.toLowerCase().includes(searchLower)
        );
      }
    }

    return items;
  }, [itemsList, inspectorSearch, typeFilterEnabled, selectedTypes, tagFilterEnabled, selectedTagCodes]);  
 
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
        <div className="p-2 border-b border-slate-700">
          <div className="flex items-center justify-between mb-1">
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
          <div className="flex gap-1.5">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search ID or File... (/regex/)"
                value={inspectorSearch}
                onChange={(e) => setInspectorSearch(e.target.value)}
                onFocus={() => setShowHistory(true)}
                className="w-full bg-slate-900 border border-slate-600 rounded py-1 px-2 text-sm text-white focus:border-blue-500 outline-none pr-8"
              />
              {filterHistory.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="absolute right-1.5 top-1 text-slate-500 hover:text-white"
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
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded transition-colors flex items-center gap-1 shadow-lg shrink-0"
              title="Natural Language Query"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Query
            </button>
            <button
              onClick={() => setIsFilterDialogOpen(true)}
              className={`text-xs font-bold px-3 py-1 rounded transition-colors flex items-center gap-1 shadow-lg shrink-0 ${
                (typeFilterEnabled && selectedTypes.size > 0) || (tagFilterEnabled && selectedTagCodes.size > 0)
                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
              title="Фильтры по типам и тегам"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filter
            </button>
            <button
              onClick={() => {
                setIsTagsDialogOpen(true);
                setSelectedId('bulk-add'); // Специальный ID для режима массового добавления
              }}
              disabled={filteredItems.length === 0}
              className="bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-lg shrink-0"
              title={`Добавить теги ко всем отфильтрованным элементам (${filteredItems.length})`}
            >
              T+
            </button>
            <button
              onClick={() => {
                setIsTagsDialogOpen(true);
                setSelectedId('bulk-remove'); // Специальный ID для режима массового удаления
              }}
              disabled={filteredItems.length === 0}
              className="bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 shadow-lg shrink-0"
              title={`Удалить теги у всех отфильтрованных элементов (${filteredItems.length})`}
            >
              T-
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredItems.map(item => (
            <div
              key={item.id}
              onClick={() => {
                selectedIdContextRef.current = currentContextCode;
                setSelectedId(item.id);
              }}
              className={`p-1.5 border-b border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors ${selectedId === item.id ? 'bg-blue-900/20 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'
                }`}
            >
              <div className="flex justify-between items-start mb-0.5">
                <span className="text-slate-200 font-mono text-sm font-bold truncate w-72" title={item.id}>
                  {item.id}
                </span>
                <span className="text-[10px] uppercase text-slate-500">{item.language}</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getBadgeColor(item.type)}`}>
                  {item.type}
                </span>
                {/* Теги из списка */}
                {item.tags && item.tags.length > 0 && item.tags.map(tag => (
                  <span
                    key={tag.id}
                    className="text-[9px] px-1 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded"
                  >
                    {tag.name}
                  </span>
                ))}
                {/* Кнопка T для открытия диалога тегов */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    selectedIdContextRef.current = currentContextCode;
                    setSelectedId(item.id);
                    setIsTagsDialogOpen(true);
                  }}
                  className="text-[9px] bg-purple-600/80 hover:bg-purple-500 text-white px-1.5 py-0.5 rounded transition-colors font-bold ml-auto"
                  title="Управление тегами"
                >
                  T
                </button>
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
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-lg font-bold text-white font-mono">{fullItemData.id}</h1>
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider ${getBadgeColor(fullItemData.type)}`}>
                      {fullItemData.type}
                    </span>
                    <button
                      onClick={handleExtractColumns}
                      disabled={extractingColumns || fullItemData.language !== 'sql'}
                      className="text-xs bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-2 py-0.5 rounded transition-colors font-bold"
                      title="Извлечь колонки таблиц из SQL-функции"
                    >
                      {extractingColumns ? '...' : 'EC'}
                    </button>
                    <button
                      onClick={() => setIsTagsDialogOpen(true)}
                      className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-2 py-0.5 rounded transition-colors font-bold"
                      title="Управление тегами"
                    >
                      T
                    </button>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-400 mb-2">
                    <span className="flex items-center gap-1">📄 {fullItemData.filePath}</span>
                    <span className="flex items-center gap-1">🌐 {fullItemData.language}</span>
                  </div>
                  {/* Теги */}
                  {loadingTags ? (
                    <div className="text-[10px] text-slate-500">Загрузка тегов...</div>
                  ) : itemTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {itemTags.map(tag => (
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
      <TagsDialog
        isOpen={isTagsDialogOpen && !!selectedId}
        onClose={() => {
          setIsTagsDialogOpen(false);
          // Перезагружаем теги после закрытия диалога
          if (selectedId && selectedId !== 'bulk-add' && selectedId !== 'bulk-remove') {
            loadItemTags(selectedId);
          }
        }}
        itemId={selectedId || ''}
        filteredItems={selectedId === 'bulk-add' || selectedId === 'bulk-remove' ? filteredItems : undefined}
        bulkMode={selectedId === 'bulk-add' ? 'add' : selectedId === 'bulk-remove' ? 'remove' : undefined}
        onTagsSaved={updateItemTagsInList}
        onBulkTagsApplied={async (affectedItemIds, operation) => {
          // Загружаем теги для всех затронутых элементов параллельно
          const updates = new Map<string, import('../types').TagSummary[]>();
          
          await Promise.all(
            affectedItemIds.map(async (itemId) => {
              try {
                const tagsRes = await apiClient.getItemTags(itemId);
                if (tagsRes.success) {
                  const tagSummaries = (tagsRes.tags || []).map(t => ({
                    id: t.id,
                    code: t.code,
                    name: t.name
                  }));
                  updates.set(itemId, tagSummaries);
                }
              } catch (err) {
                console.error(`Failed to reload tags for ${itemId}:`, err);
              }
            })
          );
          
          // Обновляем все элементы одним batch-обновлением
          if (updates.size > 0) {
            updateMultipleItemsTags(updates);
          }
        }}
      />
    </div>
  );
};

export default Inspector;