import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { PipelineStepsHistoryResponse, PipelineStepHistoryEntry } from './types';
import { apiClient } from './services/apiClient';

// Инициализация context-code из глобальной переменной или URL параметров
const getContextCode = (): string => {
  if (typeof window !== 'undefined' && (window as any).g_context_code) {
    return (window as any).g_context_code;
  }
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('context-code') || 'CARL';
};

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'completed':
      return 'text-green-400 bg-green-900/20 border-green-500/50';
    case 'running':
      return 'text-blue-400 bg-blue-900/20 border-blue-500/50';
    case 'failed':
      return 'text-red-400 bg-red-900/20 border-red-500/50';
    case 'pending':
      return 'text-slate-400 bg-slate-900/20 border-slate-500/50';
    default:
      return 'text-slate-400 bg-slate-900/20 border-slate-500/50';
  }
};

const PipelineHistoryView: React.FC = () => {
  const [history, setHistory] = useState<PipelineStepsHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stepId, setStepId] = useState<number | null>(null);
  const [limit, setLimit] = useState(100);
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());

  // Получаем параметры из URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const stepIdParam = urlParams.get('stepId');
    const limitParam = urlParams.get('limit');
    
    if (stepIdParam) {
      const parsed = parseInt(stepIdParam, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 7) {
        setStepId(parsed);
      }
    }
    
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 1000) {
        setLimit(parsed);
      }
    }
  }, []);

  // Инициализация context-code
  useEffect(() => {
    const contextCode = getContextCode();
    if (typeof window !== 'undefined') {
      (window as any).g_context_code = contextCode;
    }
  }, []);

  // Загрузка истории
  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getPipelineStepsHistory(stepId || undefined, limit);
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
      console.error('Failed to load pipeline history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [stepId, limit]);

  const toggleReport = (entryKey: string) => {
    setExpandedReports(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryKey)) {
        newSet.delete(entryKey);
      } else {
        newSet.add(entryKey);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center text-slate-400">Загрузка истории...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 text-red-400">
            Ошибка загрузки истории: {error}
          </div>
          <button
            onClick={loadHistory}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!history || !history.steps || history.steps.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-6">История выполнения шагов Pipeline</h1>
          <div className="text-slate-400">История пуста</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">История выполнения шагов Pipeline</h1>
          <div className="flex gap-4 items-center">
            <select
              value={stepId || ''}
              onChange={(e) => setStepId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white"
            >
              <option value="">Все шаги</option>
              {[1, 2, 3, 4, 5, 6, 7].map(id => (
                <option key={id} value={id}>Шаг {id}</option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              max="1000"
              value={limit}
              onChange={(e) => setLimit(Math.min(Math.max(1, parseInt(e.target.value, 10) || 100), 1000))}
              className="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white w-24"
              placeholder="Limit"
            />
            <button
              onClick={loadHistory}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white"
            >
              Обновить
            </button>
          </div>
        </div>

        {history.steps.map((stepHistory) => (
          <div key={stepHistory.stepId} className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">
              Шаг {stepHistory.stepId}: {stepHistory.stepName}
            </h2>
            
            {stepHistory.history.length === 0 ? (
              <div className="text-slate-500 text-sm">История пуста</div>
            ) : (
              <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-900/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Время</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Статус</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Прогресс</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Элементы</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Ошибка</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Отчет</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {stepHistory.history.map((entry: PipelineStepHistoryEntry, index: number) => {
                        const entryKey = `${stepHistory.stepId}-${index}`;
                        const isReportExpanded = expandedReports.has(entryKey);
                        
                        return (
                          <tr key={index} className="hover:bg-slate-700/30">
                            <td className="px-4 py-3 text-sm text-slate-300">
                              {formatTimestamp(entry.timestamp)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(entry.status)}`}>
                                {entry.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-300">
                              {entry.progress !== null ? `${entry.progress}%` : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-300">
                              {entry.itemsProcessed !== null && entry.totalItems !== null
                                ? `${entry.itemsProcessed} / ${entry.totalItems}`
                                : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {entry.error ? (
                                <span className="text-red-400">{entry.error}</span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {entry.report ? (
                                <button
                                  onClick={() => toggleReport(entryKey)}
                                  className="text-blue-400 hover:text-blue-300 text-xs underline"
                                >
                                  {isReportExpanded ? 'Скрыть' : 'Показать'}
                                </button>
                              ) : (
                                <span className="text-slate-500 text-xs">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* Раскрывающиеся отчеты */}
                {stepHistory.history.map((entry: PipelineStepHistoryEntry, index: number) => {
                  const entryKey = `${stepHistory.stepId}-${index}`;
                  const isReportExpanded = expandedReports.has(entryKey);
                  
                  if (!entry.report || !isReportExpanded) return null;
                  
                  return (
                    <div key={`report-${index}`} className="border-t border-slate-700 bg-slate-900/50 p-4">
                      <h3 className="text-sm font-semibold text-slate-300 mb-2">Отчет:</h3>
                      <pre className="text-xs text-slate-400 overflow-x-auto bg-slate-950 p-3 rounded border border-slate-700">
                        {JSON.stringify(entry.report, null, 2)}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Инициализация приложения
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<PipelineHistoryView />);
}












