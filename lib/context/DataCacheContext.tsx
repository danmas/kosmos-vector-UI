import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { AiItemSummary } from '../../types';
import { GraphData, getGraphWithFallback, getItemsListWithFallback } from '../../services/apiClient';

// Типы для кэша
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  isDemo: boolean;
}

interface ContextCache {
  graph?: CacheEntry<GraphData>;
  itemsList?: CacheEntry<AiItemSummary[]>;
}

interface DataCacheState {
  [contextCode: string]: ContextCache;
}

export interface DataCacheContextValue {
  // Текущий context code
  currentContextCode: string;
  setCurrentContextCode: (code: string) => void;
  
  // Список доступных Context Codes
  availableContextCodes: string[];
  addContextCode: (code: string) => void;
  
  // Получение данных из кэша
  getGraph: () => CacheEntry<GraphData> | null;
  getItemsList: () => CacheEntry<AiItemSummary[]> | null;
  
  // Установка данных в кэш (для случаев когда компонент сам загрузил данные)
  setGraph: (data: GraphData, isDemo: boolean) => void;
  setItemsList: (data: AiItemSummary[], isDemo: boolean) => void;
  
  // Фоновая предзагрузка всех данных
  prefetchAll: (contextCode?: string) => Promise<void>;
  
  // Инвалидация кэша
  invalidate: (contextCode?: string) => void;
  
  // Статус загрузки
  isPrefetching: boolean;
  prefetchProgress: { loaded: number; total: number };
}

const DataCacheContext = createContext<DataCacheContextValue | null>(null);

export interface DataCacheProviderProps {
  children: ReactNode;
  initialContextCode?: string;
}

export const DataCacheProvider: React.FC<DataCacheProviderProps> = ({ 
  children, 
  initialContextCode = 'CARL' 
}) => {
  const [cache, setCache] = useState<DataCacheState>({});
  const [currentContextCode, setCurrentContextCode] = useState(initialContextCode);
  const [availableContextCodes, setAvailableContextCodes] = useState<string[]>(['CARL', 'TEST']);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState({ loaded: 0, total: 2 });
  
  // Ref для отслеживания активных запросов (чтобы избежать дублирования)
  const activeRequests = useRef<Set<string>>(new Set());

  // Получить кэш для текущего контекста
  const getCurrentCache = useCallback((): ContextCache => {
    return cache[currentContextCode] || {};
  }, [cache, currentContextCode]);

  // Получить граф из кэша
  const getGraph = useCallback((): CacheEntry<GraphData> | null => {
    const contextCache = getCurrentCache();
    return contextCache.graph || null;
  }, [getCurrentCache]);

  // Получить список элементов из кэша
  const getItemsList = useCallback((): CacheEntry<AiItemSummary[]> | null => {
    const contextCache = getCurrentCache();
    return contextCache.itemsList || null;
  }, [getCurrentCache]);

  // Установить граф в кэш
  const setGraph = useCallback((data: GraphData, isDemo: boolean) => {
    setCache(prev => ({
      ...prev,
      [currentContextCode]: {
        ...prev[currentContextCode],
        graph: {
          data,
          timestamp: Date.now(),
          isDemo
        }
      }
    }));
    console.log(`[DataCache] Graph cached for context: ${currentContextCode}`);
  }, [currentContextCode]);

  // Установить список элементов в кэш
  const setItemsList = useCallback((data: AiItemSummary[], isDemo: boolean) => {
    setCache(prev => ({
      ...prev,
      [currentContextCode]: {
        ...prev[currentContextCode],
        itemsList: {
          data,
          timestamp: Date.now(),
          isDemo
        }
      }
    }));
    console.log(`[DataCache] ItemsList cached for context: ${currentContextCode}`);
  }, [currentContextCode]);

  // Фоновая предзагрузка всех данных
  const prefetchAll = useCallback(async (contextCode?: string) => {
    const targetContext = contextCode || currentContextCode;
    const requestKey = `prefetch-${targetContext}`;
    
    // Проверяем, не идёт ли уже загрузка для этого контекста
    if (activeRequests.current.has(requestKey)) {
      console.log(`[DataCache] Prefetch already in progress for context: ${targetContext}`);
      return;
    }
    
    // Проверяем, есть ли уже данные в кэше
    const existingCache = cache[targetContext];
    if (existingCache?.graph && existingCache?.itemsList) {
      console.log(`[DataCache] Data already cached for context: ${targetContext}`);
      return;
    }
    
    console.log(`[DataCache] Starting prefetch for context: ${targetContext}`);
    activeRequests.current.add(requestKey);
    setIsPrefetching(true);
    setPrefetchProgress({ loaded: 0, total: 2 });
    
    try {
      // Загружаем данные параллельно
      const results = await Promise.allSettled([
        getGraphWithFallback(),
        getItemsListWithFallback()
      ]);
      
      let loaded = 0;
      
      // Обрабатываем результат графа
      if (results[0].status === 'fulfilled') {
        const graphResult = results[0].value;
        setCache(prev => ({
          ...prev,
          [targetContext]: {
            ...prev[targetContext],
            graph: {
              data: graphResult.data,
              timestamp: Date.now(),
              isDemo: graphResult.isDemo
            }
          }
        }));
        loaded++;
        console.log(`[DataCache] Graph prefetched for context: ${targetContext}`, {
          nodes: graphResult.data.nodes.length,
          links: graphResult.data.links.length,
          isDemo: graphResult.isDemo
        });
      } else {
        console.error(`[DataCache] Failed to prefetch graph:`, results[0].reason);
      }
      
      // Обрабатываем результат списка элементов
      if (results[1].status === 'fulfilled') {
        const itemsResult = results[1].value;
        setCache(prev => ({
          ...prev,
          [targetContext]: {
            ...prev[targetContext],
            itemsList: {
              data: itemsResult.data,
              timestamp: Date.now(),
              isDemo: itemsResult.isDemo
            }
          }
        }));
        loaded++;
        console.log(`[DataCache] ItemsList prefetched for context: ${targetContext}`, {
          count: itemsResult.data.length,
          isDemo: itemsResult.isDemo
        });
      } else {
        console.error(`[DataCache] Failed to prefetch itemsList:`, results[1].reason);
      }
      
      setPrefetchProgress({ loaded, total: 2 });
      console.log(`[DataCache] Prefetch completed for context: ${targetContext} (${loaded}/2 successful)`);
      
    } catch (err) {
      console.error(`[DataCache] Prefetch error for context: ${targetContext}`, err);
    } finally {
      activeRequests.current.delete(requestKey);
      setIsPrefetching(false);
    }
  }, [cache, currentContextCode]);

  // Инвалидация кэша
  const invalidate = useCallback((contextCode?: string) => {
    if (contextCode) {
      // Инвалидируем только указанный контекст
      setCache(prev => {
        const newCache = { ...prev };
        delete newCache[contextCode];
        return newCache;
      });
      console.log(`[DataCache] Cache invalidated for context: ${contextCode}`);
    } else {
      // Инвалидируем текущий контекст
      setCache(prev => {
        const newCache = { ...prev };
        delete newCache[currentContextCode];
        return newCache;
      });
      console.log(`[DataCache] Cache invalidated for current context: ${currentContextCode}`);
    }
  }, [currentContextCode]);

  // Добавление нового Context Code
  const addContextCode = useCallback((code: string) => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      console.warn('[DataCache] Cannot add empty context code');
      return;
    }
    if (availableContextCodes.includes(trimmedCode)) {
      console.warn(`[DataCache] Context code "${trimmedCode}" already exists`);
      return;
    }
    setAvailableContextCodes(prev => [...prev, trimmedCode]);
    setCurrentContextCode(trimmedCode);
    console.log(`[DataCache] New context code added: ${trimmedCode}`);
  }, [availableContextCodes]);

  const value: DataCacheContextValue = {
    currentContextCode,
    setCurrentContextCode,
    availableContextCodes,
    addContextCode,
    getGraph,
    getItemsList,
    setGraph,
    setItemsList,
    prefetchAll,
    invalidate,
    isPrefetching,
    prefetchProgress
  };

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  );
};

export const useDataCache = (): DataCacheContextValue => {
  const context = useContext(DataCacheContext);
  if (!context) {
    throw new Error('useDataCache must be used within a DataCacheProvider');
  }
  return context;
};


