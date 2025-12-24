import { useState, useEffect } from 'react';
import { AiItem } from '../../types';
import { DashboardStats, GraphData } from '../../services/apiClient';
import { useAiItemContext } from '../context/AiItemContext';

export interface UseAiItemsResult {
  items: AiItem[];
  isLoading: boolean;
  error: string | null;
  isDemoMode: boolean;
  refetch: () => Promise<void>;
}

export interface UseAiItemStatsResult {
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;
  isDemoMode: boolean;
  refetch: () => Promise<void>;
}

export interface UseAiItemGraphResult {
  graphData: GraphData | null;
  isLoading: boolean;
  error: string | null;
  isDemoMode: boolean;
  refetch: () => Promise<void>;
}

export const useAiItems = (): UseAiItemsResult => {
  const { apiClient } = useAiItemContext();
  const [items, setItems] = useState<AiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const fetchItems = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiClient.getItems();
      setItems(result);
      setIsDemoMode(false);
    } catch (err: any) {
      console.error('Failed to fetch items:', err);
      
      // Handle demo mode fallback
      if (err.code === 'SERVER_UNAVAILABLE' || err.code === 'NETWORK_ERROR') {
        // Use fallback function from apiClient
        const { getItemsWithFallback } = await import('../../services/apiClient');
        const fallbackResult = await getItemsWithFallback();
        setItems(fallbackResult.data);
        setIsDemoMode(fallbackResult.isDemo);
        setError(null); // Clear error since we have fallback data
      } else {
        setError(err.message || 'Failed to load items');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [apiClient]);

  return {
    items,
    isLoading,
    error,
    isDemoMode,
    refetch: fetchItems,
  };
};

export const useAiItemStats = (): UseAiItemStatsResult => {
  const { apiClient } = useAiItemContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiClient.getStats();
      setStats(result);
      setIsDemoMode(false);
    } catch (err: any) {
      console.error('Failed to fetch stats:', err);
      
      if (err.code === 'SERVER_UNAVAILABLE' || err.code === 'NETWORK_ERROR') {
        const { getStatsWithFallback } = await import('../../services/apiClient');
        const fallbackResult = await getStatsWithFallback();
        setStats(fallbackResult.data);
        setIsDemoMode(fallbackResult.isDemo);
        setError(null);
      } else {
        setError(err.message || 'Failed to load statistics');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [apiClient]);

  return {
    stats,
    isLoading,
    error,
    isDemoMode,
    refetch: fetchStats,
  };
};

export const useAiItemGraph = (): UseAiItemGraphResult => {
  const { apiClient } = useAiItemContext();
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const fetchGraph = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiClient.getGraph();
      setGraphData(result);
      setIsDemoMode(false);
    } catch (err: any) {
      console.error('Failed to fetch graph data:', err);
      
      if (err.code === 'SERVER_UNAVAILABLE' || err.code === 'NETWORK_ERROR') {
        const { getGraphWithFallback } = await import('../../services/apiClient');
        const fallbackResult = await getGraphWithFallback();
        setGraphData(fallbackResult.data);
        setIsDemoMode(fallbackResult.isDemo);
        setError(null);
      } else {
        setError(err.message || 'Failed to load graph data');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, [apiClient]);

  return {
    graphData,
    isLoading,
    error,
    isDemoMode,
    refetch: fetchGraph,
  };
};
