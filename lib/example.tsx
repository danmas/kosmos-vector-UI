import React, { useState } from 'react';
import { 
  AiItemProvider, 
  Dashboard, 
  KnowledgeGraph, 
  Inspector,
  ChatInterface,
  Sidebar,
  AppView
} from '@aiitem/ui-components';

/**
 * Пример полного приложения с использованием @aiitem/ui-components
 */
export default function ExampleApp() {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [apiUrl, setApiUrl] = useState('http://localhost:3200');
  const [demoMode, setDemoMode] = useState(false);

  const renderView = () => {
    switch (currentView) {
      case AppView.DASHBOARD:
        return <Dashboard />;
      case AppView.INSPECTOR:
        return <Inspector />;
      case AppView.GRAPH:
        return <KnowledgeGraph />;
      case AppView.CHAT:
        return <ChatInterface />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <AiItemProvider baseUrl={apiUrl} demoMode={demoMode}>
      <div className="flex h-screen bg-slate-900 text-slate-200">
        {/* Sidebar */}
        <Sidebar currentView={currentView} onChangeView={setCurrentView} />
        
        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {/* Configuration Panel */}
          <div className="p-4 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
            <h1 className="text-lg font-bold">AiItem RAG Dashboard</h1>
            
            <div className="flex items-center gap-4">
              {/* API URL Configuration */}
              <div className="flex items-center gap-2">
                <label className="text-sm">API URL:</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm"
                  placeholder="http://localhost:3200"
                />
              </div>
              
              {/* Demo Mode Toggle */}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={demoMode}
                  onChange={(e) => setDemoMode(e.target.checked)}
                  className="rounded"
                />
                Demo Mode
              </label>
            </div>
          </div>
          
          {/* View Content */}
          <div className="flex-1 overflow-hidden">
            {renderView()}
          </div>
        </main>
      </div>
    </AiItemProvider>
  );
}

/**
 * Минимальный пример использования одного компонента
 */
export function MinimalDashboardExample() {
  return (
    <AiItemProvider baseUrl="http://localhost:3200">
      <div className="h-screen bg-slate-900">
        <Dashboard />
      </div>
    </AiItemProvider>
  );
}

/**
 * Пример с пользовательскими хуками
 */
export function CustomHooksExample() {
  return (
    <AiItemProvider baseUrl="http://localhost:3200">
      <CustomStatsDisplay />
    </AiItemProvider>
  );
}

function CustomStatsDisplay() {
  const { useAiItemStats } = require('@aiitem/ui-components');
  const { stats, isLoading, error, isDemoMode } = useAiItemStats();

  if (isLoading) return <div>Loading stats...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="p-6 bg-slate-900 text-white">
      {isDemoMode && (
        <div className="mb-4 p-2 bg-amber-600 text-black rounded">
          Demo Mode: Using mock data
        </div>
      )}
      
      <h2 className="text-2xl mb-4">Project Statistics</h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800 p-4 rounded">
          <h3>Total Items</h3>
          <p className="text-3xl">{stats?.totalItems}</p>
        </div>
        
        <div className="bg-slate-800 p-4 rounded">
          <h3>Dependencies</h3>
          <p className="text-3xl">{stats?.totalDeps}</p>
        </div>
      </div>
    </div>
  );
}
