import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface GraphFilterContextValue {
  filteredItemIds: Set<string>;
  setFilteredItemIds: (ids: Set<string>) => void;
  // Раздельные поисковые запросы
  inspectorSearch: string;
  setInspectorSearch: (query: string) => void;
  graphSearch: string;
  setGraphSearch: (query: string) => void;
  // Общая история
  filterHistory: string[];
  addToHistory: (query: string) => void;
  clearHistory: () => void;
  // Очистка всех фильтров
  clearFilters: () => void;

  // Фильтры по типам
  typeFilterEnabled: boolean;
  setTypeFilterEnabled: (enabled: boolean) => void;
  selectedTypes: Set<string>;
  toggleType: (type: string) => void;
  setAllTypes: (types: string[]) => void;
  
  // Фильтры по тегам
  tagFilterEnabled: boolean;
  setTagFilterEnabled: (enabled: boolean) => void;
  selectedTagCodes: Set<string>;
  toggleTag: (tagCode: string) => void;
  setAllTags: (tagCodes: string[]) => void;

  // Фильтры по файлам
  fileFilterEnabled: boolean;
  setFileFilterEnabled: (enabled: boolean) => void;
  selectedFilePaths: Set<string>;
  toggleFile: (filePath: string) => void;
  setAllFiles: (filePaths: string[]) => void;

  // Диалог фильтрации
  isFilterDialogOpen: boolean;
  setIsFilterDialogOpen: (open: boolean) => void;
}

const GraphFilterContext = createContext<GraphFilterContextValue | null>(null);

const KEYS = {
  INSPECTOR: 'kosmos_vector_inspector_search',
  GRAPH: 'kosmos_vector_graph_search',
  HISTORY: 'kosmos_vector_filter_history'
};

export const GraphFilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [filteredItemIds, setFilteredItemIds] = useState<Set<string>>(new Set());

  const [inspectorSearch, setInspectorSearchState] = useState(() => localStorage.getItem(KEYS.INSPECTOR) || '');
  const [graphSearch, setGraphSearchState] = useState(() => localStorage.getItem(KEYS.GRAPH) || '');

  const [filterHistory, setFilterHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEYS.HISTORY) || '[]'); } catch { return []; }
  });

  // Фильтры по типам
  const [typeFilterEnabled, setTypeFilterEnabled] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  // Фильтры по тегам
  const [tagFilterEnabled, setTagFilterEnabled] = useState(false);
  const [selectedTagCodes, setSelectedTagCodes] = useState<Set<string>>(new Set());

  // Фильтры по файлам
  const [fileFilterEnabled, setFileFilterEnabled] = useState(false);
  const [selectedFilePaths, setSelectedFilePaths] = useState<Set<string>>(new Set());

  // Диалог фильтрации
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);

  const addToHistory = useCallback((query: string) => {
    if (!query.trim() || query.length < 2) return;
    setFilterHistory(prev => {
      const newHistory = [query, ...prev.filter(q => q !== query)].slice(0, 20);
      localStorage.setItem(KEYS.HISTORY, JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  const setInspectorSearch = useCallback((q: string) => {
    setInspectorSearchState(q);
    localStorage.setItem(KEYS.INSPECTOR, q);
    if (q.trim()) addToHistory(q);
  }, [addToHistory]);

  const setGraphSearch = useCallback((q: string) => {
    setGraphSearchState(q);
    localStorage.setItem(KEYS.GRAPH, q);
    if (q.trim()) addToHistory(q);
  }, [addToHistory]);

  const clearHistory = useCallback(() => {
    setFilterHistory([]);
    localStorage.removeItem(KEYS.HISTORY);
  }, []);

  const toggleType = useCallback((type: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const setAllTypes = useCallback((types: string[]) => {
    setSelectedTypes(new Set(types));
  }, []);

  const toggleTag = useCallback((tagCode: string) => {
    setSelectedTagCodes(prev => {
      const next = new Set(prev);
      if (next.has(tagCode)) next.delete(tagCode);
      else next.add(tagCode);
      return next;
    });
  }, []);

  const setAllTags = useCallback((tagCodes: string[]) => {
    setSelectedTagCodes(new Set(tagCodes));
  }, []);

  const toggleFile = useCallback((filePath: string) => {
    setSelectedFilePaths(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  const setAllFiles = useCallback((filePaths: string[]) => {
    setSelectedFilePaths(new Set(filePaths));
  }, []);

  // Очистка всех фильтров (используется при смене контекста)
  const clearFilters = useCallback(() => {
    setFilteredItemIds(new Set());
    setInspectorSearchState('');
    setGraphSearchState('');
    setTypeFilterEnabled(false);
    setSelectedTypes(new Set());
    setTagFilterEnabled(false);
    setSelectedTagCodes(new Set());
    setFileFilterEnabled(false);
    setSelectedFilePaths(new Set());
    localStorage.removeItem(KEYS.INSPECTOR);
    localStorage.removeItem(KEYS.GRAPH);
    console.log('[GraphFilter] All filters cleared due to context change');
  }, []);

  const value: GraphFilterContextValue = {
    filteredItemIds,
    setFilteredItemIds,
    inspectorSearch,
    setInspectorSearch,
    graphSearch,
    setGraphSearch,
    filterHistory,
    addToHistory,
    clearHistory,
    clearFilters,
    // Типы
    typeFilterEnabled,
    setTypeFilterEnabled,
    selectedTypes,
    toggleType,
    setAllTypes,
    // Теги
    tagFilterEnabled,
    setTagFilterEnabled,
    selectedTagCodes,
    toggleTag,
    setAllTags,
    // Файлы
    fileFilterEnabled,
    setFileFilterEnabled,
    selectedFilePaths,
    toggleFile,
    setAllFiles,
    // Диалог
    isFilterDialogOpen,
    setIsFilterDialogOpen,
  };

  return (
    <GraphFilterContext.Provider value={value}>
      {children}
    </GraphFilterContext.Provider>
  );
};

export const useGraphFilter = (): GraphFilterContextValue => {
  const context = useContext(GraphFilterContext);
  if (!context) {
    throw new Error('useGraphFilter must be used within a GraphFilterProvider');
  }
  return context;
};
