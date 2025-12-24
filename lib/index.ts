// Export all components
export { default as Dashboard } from '../components/Dashboard';
export { default as KnowledgeGraph } from '../components/KnowledgeGraph';
export { default as Inspector } from '../components/Inspector';
export { default as ChatInterface } from '../components/ChatInterface';
export { default as FileExplorer } from '../components/FileExplorer';
export { default as Sidebar } from '../components/Sidebar';
export { default as LogViewer } from '../components/LogViewer';
export { default as PipelineView } from '../components/PipelineView';

// Export services
export { 
  ApiClient, 
  ApiError, 
  apiClient,
  getItemsWithFallback,
  getStatsWithFallback,
  getGraphWithFallback
} from '../services/apiClient';

// Export types
export * from '../types';

// Export constants (for demo/fallback purposes)
export { MOCK_AI_ITEMS, MOCK_FILE_TREE } from '../constants';

// Export context and hooks (to be created)
export { AiItemProvider, useAiItemContext } from './context/AiItemContext';
export { useAiItems, useAiItemStats, useAiItemGraph } from './hooks/useAiItems';
