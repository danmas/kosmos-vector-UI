import React from 'react';
import { AppView } from '../types';

interface SidebarProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
  onOpenLogsDialog: () => void;
  contextCode: string;
  setContextCode: (code: string) => void;
  onRefreshCache?: () => void;
  isPrefetching?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onChangeView, 
  onOpenLogsDialog, 
  contextCode, 
  setContextCode,
  onRefreshCache,
  isPrefetching = false
}) => {
  const navItems = [
    { id: AppView.DASHBOARD, label: 'Dashboard', icon: '📊' },
    { id: AppView.FILES, label: 'Knowledge Base', icon: '🗄️' },
    { id: AppView.PIPELINE, label: 'Processing', icon: '⚙️' },
    { id: AppView.INSPECTOR, label: 'Data Inspector', icon: '🔍' },
    { id: AppView.GRAPH, label: 'Graph View', icon: '🕸️' },
    { id: AppView.CHAT, label: 'RAG Client', icon: '💬' },
  ];

  return (
    <aside className="w-48 bg-slate-900 border-r border-slate-700 flex flex-col h-screen">
      <div className="p-3 border-b border-slate-700">
        <h1 className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
          AiItem Architect
        </h1>
        <p className="text-[10px] text-slate-500 mt-0.5">Codebase RAG System</p>
      </div>
      
      <nav className="flex-1 py-2 overflow-y-auto">
        <ul>
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onChangeView(item.id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                  currentView === item.id
                    ? 'bg-blue-900/30 text-blue-400 border-r-2 border-blue-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span className="text-sm">{item.icon}</span>
                <span className="font-medium text-xs">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
        
        <div className="mt-2 pt-2 border-t border-slate-800">
             <button
                onClick={onOpenLogsDialog}
                className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              >
                <span className="text-sm">📟</span>
                <span className="font-medium text-xs">Server Logs</span>
              </button>
        </div>
      </nav>

      <div className="p-3 border-t border-slate-700 space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          System Online
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-slate-400">Context Code:</label>
          <div className="flex gap-1.5">
            <select
              value={contextCode}
              onChange={(e) => setContextCode(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-600 text-slate-200 text-[10px] px-1.5 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            >
              <option value="CARL">CARL</option>
              <option value="TEST">TEST</option>
            </select>
            {onRefreshCache && (
              <button
                onClick={onRefreshCache}
                disabled={isPrefetching}
                title={isPrefetching ? "Загрузка..." : "Обновить кэш данных"}
                className={`px-1.5 py-1 rounded text-[10px] transition-colors ${
                  isPrefetching 
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                    : 'bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {isPrefetching ? (
                  <span className="inline-block w-2.5 h-2.5 border border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                ) : (
                  '🔄'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;