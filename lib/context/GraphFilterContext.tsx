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

  // Очистка всех фильтров (используется при смене контекста)
  const clearFilters = useCallback(() => {
    setFilteredItemIds(new Set());
    setInspectorSearchState('');
    setGraphSearchState('');
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
    clearFilters
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