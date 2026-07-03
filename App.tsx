import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import FileExplorer from './components/FileExplorer';
import PipelineView from './components/PipelineView';
import KnowledgeGraph from './components/KnowledgeGraph';
import ChatInterface from './components/ChatInterface';
import Inspector from './components/Inspector';
import LogViewer from './components/LogViewer';
import ServerLogsDialog from './components/ServerLogsDialog';
import PromptsEditorDialog from './components/PromptsEditorDialog';
import SettingsDialog from './components/SettingsDialog';
import { AppView, FileNode, ProjectFile } from './types';
import { MOCK_FILE_TREE } from './constants';
import { getProjectTreeWithFallback, getKbConfigWithFallback, apiClient } from './services/apiClient';
import { GraphFilterProvider, useGraphFilter } from './lib/context/GraphFilterContext';
import { DataCacheProvider, useDataCache } from './lib/context/DataCacheContext';
import FilterDialog from './components/FilterDialog';

// Глобальная переменная для context_code
declare global {
  interface Window {
    g_context_code: string;
  }
}

// Внутренний компонент с основной логикой приложения
const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [excludedFiles, setExcludedFiles] = useState<string[]>([]);
  const [isLogsDialogOpen, setIsLogsDialogOpen] = useState<boolean>(false);
  const [isPromptsEditorOpen, setIsPromptsEditorOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Обработчик открытия Server Logs в диалоге
  const handleOpenLogsDialog = () => {
    setIsLogsDialogOpen(true);
  };

  // Обработчик открытия Server Logs в отдельном окне браузера
  const handleOpenLogsWindow = () => {
    const url = `/server-logs-viewer.html?context-code=${encodeURIComponent(contextCode)}`;
    window.open(url, '_blank', 'width=1400,height=900,menubar=no,toolbar=no,location=no,status=no');
  };

  // v2.1.1: Переключатель между legacy и новым API
  const [useNewApi, setUseNewApi] = useState<boolean>(true);

  // Доступ к кэшу данных
  const {
    currentContextCode: contextCode,
    setCurrentContextCode,
    availableContextCodes,
    addContextCode,
    prefetchAll,
    invalidate,
    isPrefetching
  } = useDataCache();

  // Доступ к фильтрам для очистки при смене контекста и диалог фильтрации
  const { clearFilters, isFilterDialogOpen, setIsFilterDialogOpen } = useGraphFilter();

  // Обёртка для setContextCode с синхронным обновлением глобальной переменной
  const setContextCode = (code: string) => {
    // Синхронно обновляем window.g_context_code, чтобы API запросы использовали правильный контекст
    if (typeof window !== 'undefined') {
      window.g_context_code = code;
    }
    setCurrentContextCode(code);
  };

  // Инициализация глобальной переменной при монтировании
  useEffect(() => {
    window.g_context_code = 'CARL';
  }, []);

  // Переключение view только при смене contextCode
  useEffect(() => {
    console.log('[App] Context changed, switching to Dashboard. contextCode:', contextCode);
    setCurrentView(AppView.DASHBOARD);
  }, [contextCode]);

  // Загрузка данных
  useEffect(() => {
    window.g_context_code = contextCode;
    clearFilters();
    prefetchAll(contextCode);
  }, [contextCode, prefetchAll, clearFilters]);

  // // Обновление глобальной переменной и запуск фоновой загрузки при изменении контекста
  // useEffect(() => {
  //   window.g_context_code = contextCode;
  //   // Очищаем все фильтры при смене контекста
  //   clearFilters();
  //   // Запускаем фоновую предзагрузку данных
  //   console.log(`[App] Context changed to: ${contextCode}, starting prefetch...`);
  //   prefetchAll(contextCode);
  //   // Переключаемся на Dashboard для нового контекста
  //   setCurrentView(AppView.DASHBOARD);
  // }, [contextCode, prefetchAll, clearFilters]);

  // Конвертация ProjectFile[] в FileNode[]
  const convertProjectFilesToFileNodes = (projectFiles: ProjectFile[]): FileNode[] => {
    return projectFiles.map((pf: ProjectFile): FileNode => ({
      id: pf.path,
      name: pf.name,
      type: pf.type === 'directory' ? 'folder' : 'file',
      children: pf.children ? convertProjectFilesToFileNodes(pf.children) : undefined,
      checked: pf.selected,
      error: pf.error || false,
      errorMessage: pf.errorMessage
    }));
  };

  const fetchFileTree = async (path?: string, includePatterns?: string, ignorePatterns?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Получаем rootPath из KB config (должен быть абсолютным путем на сервере)
      let rootPath: string;
      try {
        const kbConfig = await getKbConfigWithFallback();
        // rootPath из KB config должен быть абсолютным путем на сервере
        rootPath = kbConfig.data.rootPath || kbConfig.data.targetPath;
        if (!rootPath) {
          throw new Error('No rootPath in KB config');
        }
      } catch (err) {
        // Если не удалось получить rootPath из KB config, проверяем доступность бэкенда
        // Если бэкенд недоступен, сразу переходим в demo mode
        if (err instanceof Error && (err.message.includes('SERVER_UNAVAILABLE') || err.message.includes('NETWORK_ERROR'))) {
          throw new Error("BACKEND_UNREACHABLE");
        }
        console.warn('Failed to load KB config, will use fallback');
        // Если не удалось получить rootPath, используем переданный path или fallback на demo
        if (path) {
          rootPath = path;
        } else {
          // Если нет пути, переходим в demo mode
          throw new Error("BACKEND_UNREACHABLE");
        }
      }

      // Используем новый API /api/project/tree
      const result = await getProjectTreeWithFallback(rootPath, 12);

      // Если бэкенд недоступен (demo mode), используем mock data
      if (result.isDemo && result.data.length === 0) {
        throw new Error("BACKEND_UNREACHABLE");
      }

      // Конвертируем ProjectFile[] в FileNode[]
      const fileNodes = convertProjectFilesToFileNodes(result.data);

      if (fileNodes.length > 0) {
        setFileTree(fileNodes);
        if (fileNodes[0]?.id && !currentPath) {
          setCurrentPath(fileNodes[0].id);
        }
        setIsDemoMode(result.isDemo);
      } else {
        setFileTree([]);
        setIsDemoMode(result.isDemo);
      }
    } catch (err: any) {
      // Silent fallback to Demo Mode
      if (err.message === "BACKEND_UNREACHABLE" || err.name === 'TypeError' ||
        (err instanceof Error && err.message.includes('SERVER_UNAVAILABLE'))) {
        console.warn("Backend server not detected. Switching to Demo Mode.");
      } else {
        console.error("File System Error:", err);
      }

      // Fallback to Mock Data
      setFileTree(MOCK_FILE_TREE);
      setIsDemoMode(true);
      setError(null); // Clear visual error since we are handling it via Demo Mode
      if (!currentPath) setCurrentPath('project_root');
    } finally {
      setIsLoading(false);
    }
  };

  // Проверка доступности сервера при старте (только health check, без лишних fetch-запросов)
  useEffect(() => {
    const checkServer = async () => {
      console.log('🔍 [Startup] Checking backend server availability...');

      try {
        const health = await apiClient.healthCheck();
        console.log('✅ [Startup] Health check passed:', health);
        console.log('✅ [Startup] Backend server check completed');
      } catch (err) {
        console.error('❌ [Startup] Backend server health check failed:', err);
        console.warn('⚠️ [Startup] Application will run in demo mode');
      }
    };

    checkServer();
  }, []);

  // Fetch default file structure on mount
  useEffect(() => {
    fetchFileTree();
  }, []);

  const handleSelectionChange = (selected: string[], excluded: string[]) => {
    setSelectedFiles(selected);
    setExcludedFiles(excluded);
    console.log(`File selection changed: ${selected.length} selected, ${excluded.length} excluded`);
  };

  const handleStartProcessing = async (config: {
    projectPath: string;
    filePatterns: string[];
    selectedFiles: string[];
    excludedFiles: string[];
  }) => {
    try {
      console.log('Starting processing with config:', config);

      const response = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Pipeline started successfully:', result);

        // Переключаемся на Pipeline view для мониторинга
        setCurrentView(AppView.PIPELINE);
        // Автоматически открываем диалог логов для отслеживания процесса
        setIsLogsDialogOpen(true);
      } else {
        const error = await response.json();
        console.error('Failed to start pipeline:', error);
        setError(`Failed to start pipeline: ${error.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error starting pipeline:', err);
      setError(`Error starting pipeline: ${err}`);
    }
  };

  const renderView = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard />;
      case AppView.FILES:
        return (
          <div className="flex flex-col h-full">
            {/* v2.1.1 API Toggle */}
            <div className="bg-slate-800 px-6 py-3 border-b border-slate-700 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-slate-300">File Explorer Mode:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useNewApi}
                    onChange={(e) => setUseNewApi(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-offset-0 focus:ring-0"
                  />
                  <span className="text-sm text-slate-400">
                    Use v2.1.1 API
                    <span className="ml-1 text-xs text-blue-400">(Project Tree + File Selection)</span>
                  </span>
                </label>
              </div>
              <div className="text-xs text-slate-500">
                {useNewApi ? 'New standalone mode with automatic KB sync' : 'Legacy mode with external state management'}
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {useNewApi ? (
                <FileExplorer
                  standalone={true}
                />
              ) : (
                <FileExplorer
                  files={fileTree}
                  onScan={(path, include, ignore) => fetchFileTree(path, include, ignore)}
                  currentPath={currentPath}
                  isLoading={isLoading}
                  error={error}
                  onSelectionChange={handleSelectionChange}
                  onStartProcessing={handleStartProcessing}
                />
              )}
            </div>
          </div>
        );
      case AppView.PIPELINE:
        return <PipelineView onOpenLogs={() => setIsLogsDialogOpen(true)} />;
      case AppView.INSPECTOR:
        return <Inspector key={contextCode} />;
      case AppView.GRAPH:
        return <KnowledgeGraph key={contextCode} />;
      case AppView.CHAT:
        return <ChatInterface key={contextCode} />;
      case AppView.LOGS:
        return <LogViewer />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden">
      <Sidebar
        currentView={currentView}
        onChangeView={setCurrentView}
        onOpenLogsDialog={handleOpenLogsDialog}
        onOpenLogsWindow={handleOpenLogsWindow}
        onOpenPromptsEditor={() => setIsPromptsEditorOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        contextCode={contextCode}
        setContextCode={setContextCode}
        availableContextCodes={availableContextCodes}
        onAddContextCode={addContextCode}
        onRefreshCache={() => {
          invalidate();
          prefetchAll(contextCode);
        }}
        isPrefetching={isPrefetching}
      />
      <main className="flex-1 overflow-hidden relative bg-slate-900 flex flex-col">
        {isDemoMode && (
          <div className="bg-amber-900/20 border-b border-amber-700/30 text-amber-400/80 text-xs px-4 py-1 flex justify-between items-center backdrop-blur-sm">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <b>Demo Mode Active</b> &mdash; Backend unreachable. Displaying mock project data.
            </span>
            <div className="flex gap-4 items-center">
              <select
                value={contextCode}
                onChange={(e) => setContextCode(e.target.value)}
                className="bg-black/30 border border-amber-700/30 text-amber-400/80 text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              >
                <option value="CARL">CARL</option>
                <option value="TEST">TEST</option>
              </select>
              <code className="bg-black/30 px-2 rounded text-slate-400">npm run server</code>
              <button onClick={() => fetchFileTree(currentPath)} className="hover:text-white underline">Retry Connection</button>
            </div>
          </div>
        )}
        {/* Индикатор фоновой загрузки кэша */}
        {isPrefetching && (
          <div className="bg-blue-900/20 border-b border-blue-700/30 text-blue-400/80 text-xs px-4 py-1 flex items-center gap-2 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            <span>Загрузка данных для контекста <b>{contextCode}</b>...</span>
          </div>
        )}
        <div className="flex-1 overflow-hidden relative">
          {renderView()}
        </div>
      </main>
      <ServerLogsDialog
        isOpen={isLogsDialogOpen}
        onClose={() => setIsLogsDialogOpen(false)}
      />
      <PromptsEditorDialog
        isOpen={isPromptsEditorOpen}
        onClose={() => setIsPromptsEditorOpen(false)}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <FilterDialog
        isOpen={isFilterDialogOpen}
        onClose={() => setIsFilterDialogOpen(false)}
      />

    </div>
  );
};

// Главный компонент App - оборачивает всё в провайдеры
const App: React.FC = () => {
  return (
    <DataCacheProvider initialContextCode="CARL">
      <GraphFilterProvider>
        <AppContent />
      </GraphFilterProvider>
    </DataCacheProvider>
  );
};

export default App;