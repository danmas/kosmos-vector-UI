import React, { useState, useEffect, useRef } from 'react';
import { PipelineStep } from '../types';
import { apiClient } from '../services/apiClient';
import { useDataCache } from '../lib/context/DataCacheContext';

const STEP_DETAILS: Record<number, string> = {
  1: 'Parsing AST for .py, .ts, .go, .java files...',
  2: 'Resolving imports, class hierarchy, and calls...',
  3: 'Generating natural language descriptions via LLM...',
  4: 'Creating embeddings (text-embedding-ada-002 or Gecko)...',
  5: 'Building FAISS/ChromaDB index...'
};

const STEP_LABELS: Record<number, string> = {
  1: 'Polyglot Parsing (L0)',
  2: 'Dependency Analysis (L1)',
  3: 'Semantic Enrichment (L2)',
  4: 'Vectorization',
  5: 'Index Construction'
};

interface PipelineViewProps {
  onOpenLogs?: () => void;
}

const PipelineView: React.FC<PipelineViewProps> = ({ onOpenLogs }) => {
  const { invalidate, prefetchAll } = useDataCache();
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: '1', label: STEP_LABELS[1], status: 'pending', details: STEP_DETAILS[1] },
    { id: '2', label: STEP_LABELS[2], status: 'pending', details: STEP_DETAILS[2] },
    { id: '3', label: STEP_LABELS[3], status: 'pending', details: STEP_DETAILS[3] },
    { id: '4', label: STEP_LABELS[4], status: 'pending', details: STEP_DETAILS[4] },
    { id: '5', label: STEP_LABELS[5], status: 'pending', details: STEP_DETAILS[5] },
  ]);
  const [loadingSteps, setLoadingSteps] = useState<Set<number>>(new Set());
  const [selectedStepReport, setSelectedStepReport] = useState<{ stepId: number; stepLabel: string; report: object } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // Ref для отслеживания предыдущих статусов шагов (чтобы определить переход в completed)
  const prevStepsRef = useRef<PipelineStep[]>(steps);

  // Загрузка статуса шагов с сервера
  const fetchStepsStatus = async () => {
    try {
      const response = await apiClient.getPipelineStepsStatus();
      if (response.success && response.steps) {
        const serverSteps = response.steps;
        setSteps(prevSteps => {
          const newSteps = prevSteps.map(prevStep => {
            const serverStep = serverSteps.find(s => s.id === parseInt(prevStep.id));
            if (serverStep) {
              // Маппинг статусов с сервера на статусы фронтенда
              let status: 'pending' | 'processing' | 'completed' | 'error' = 'pending';
              if (serverStep.status === 'running') {
                status = 'processing';
              } else if (serverStep.status === 'completed') {
                status = 'completed';
              } else if (serverStep.status === 'failed') {
                status = 'error';
              }
              
              return {
                ...prevStep,
                status,
                label: serverStep.label || prevStep.label,
                report: (serverStep as any).report || null
              };
            }
            return prevStep;
          });
          
          // Проверяем, какие шаги перешли из processing в completed
          const previousSteps = prevStepsRef.current;
          newSteps.forEach((newStep, index) => {
            const prevStep = previousSteps[index];
            if (prevStep && prevStep.status === 'processing' && newStep.status === 'completed') {
              // Шаг завершился - обновляем кэш данных
              console.log(`[PipelineView] Step ${newStep.id} (${newStep.label}) completed, invalidating cache...`);
              invalidate();
              // Автоматически перезагружаем данные
              prefetchAll().catch(err => {
                console.warn('[PipelineView] Failed to prefetch data after step completion:', err);
              });
            }
          });
          
          // Обновляем ref с новыми статусами
          prevStepsRef.current = newSteps;
          
          return newSteps;
        });
      }
    } catch (error) {
      // Если API недоступен, используем локальное состояние
      console.warn('Failed to fetch steps status:', error);
    }
  };

  // Инициализация ref при монтировании
  useEffect(() => {
    prevStepsRef.current = steps;
  }, []);

  // Polling для обновления статуса
  useEffect(() => {
    fetchStepsStatus(); // Загружаем сразу
    const interval = setInterval(fetchStepsStatus, 2000); // Обновляем каждые 2 секунды
    return () => clearInterval(interval);
  }, []);

  // Запуск отдельного шага
  const runStep = async (stepId: number) => {
    // Проверяем, не выполняется ли уже этот шаг
    if (loadingSteps.has(stepId)) {
      return;
    }

    // Открываем диалог логов при старте
    onOpenLogs?.();

    setLoadingSteps(prev => new Set(prev).add(stepId));
    
    // Обновляем локальное состояние сразу
    setSteps(prev => prev.map(s => 
      s.id === stepId.toString() ? { ...s, status: 'processing' } : s
    ));

    try {
      await apiClient.runPipelineStep(stepId);
      // Статус будет обновлен через polling
    } catch (error) {
      console.error(`Failed to run step ${stepId}:`, error);
      setSteps(prev => prev.map(s => 
        s.id === stepId.toString() ? { ...s, status: 'error' } : s
      ));
    } finally {
      setLoadingSteps(prev => {
        const newSet = new Set(prev);
        newSet.delete(stepId);
        return newSet;
      });
    }
  };

  const runPipeline = () => {
    if (isRunning) return;
    setIsRunning(true);
    
    // Reset
    setSteps(steps.map(s => ({ ...s, status: 'pending' })));

    let currentStepIndex = 0;

    const processNextStep = () => {
      if (currentStepIndex >= steps.length) {
        setIsRunning(false);
        return;
      }

      setSteps(prev => prev.map((s, i) => {
        if (i === currentStepIndex) return { ...s, status: 'processing' };
        return s;
      }));

      // Simulate processing time
      setTimeout(() => {
        setSteps(prev => prev.map((s, i) => {
          if (i === currentStepIndex) return { ...s, status: 'completed' };
          return s;
        }));
        currentStepIndex++;
        processNextStep();
      }, 1200);
    };

    processNextStep();
  };

  // Очистка векторной БД
  const handleClearVectorDB = async () => {
    setIsClearing(true);
    try {
      const result = await apiClient.clearVectorDatabase();
      if (result.success) {
        alert('Векторная база данных успешно очищена');
        setShowClearConfirm(false);
      } else {
        alert('Ошибка при очистке векторной БД');
      }
    } catch (error) {
      console.error('Failed to clear vector database:', error);
      alert('Ошибка при очистке векторной БД: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="p-3 max-w-5xl mx-auto h-full overflow-y-auto">
      <div className="mb-3 text-center">
        <h2 className="text-xl font-bold text-white mb-1">Knowledge Processing Pipeline</h2>
        <p className="text-slate-400 text-sm">
            This pipeline transforms raw source code into a vectorized knowledge base ready for RAG.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Pipeline Steps */}
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 shadow-xl">
            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={step.id} className="relative pl-8">
                  {/* Connector Line */}
                  {index !== steps.length - 1 && (
                    <div className={`absolute left-[15px] top-6 bottom-[-12px] w-0.5 ${
                      step.status === 'completed' ? 'bg-green-500' : 'bg-slate-700'
                    }`} />
                  )}
                  
                  {/* Status Icon - кликабельный */}
                  <div 
                    onClick={() => runStep(index + 1)}
                    className={`absolute left-0 top-0.5 w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 bg-slate-800 transition-all text-xs ${
                      step.status === 'completed' ? 'border-green-500 text-green-500 hover:border-green-400 hover:bg-green-900/20 cursor-pointer' :
                      step.status === 'processing' ? 'border-blue-500 text-blue-500 animate-pulse cursor-wait' :
                      step.status === 'error' ? 'border-red-500 text-red-500 hover:border-red-400 hover:bg-red-900/20 cursor-pointer' :
                      'border-slate-600 text-slate-600 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-900/20 cursor-pointer'
                    }`}
                    title={step.status === 'processing' ? 'Processing...' : `Click to run ${step.label}`}
                  >
                    {step.status === 'completed' ? '✓' : 
                     step.status === 'processing' ? '↻' : 
                     (index + 1)}
                  </div>

                  {/* Content */}
                  <div className={`p-2 rounded-lg border transition-all ${
                     step.status === 'processing' ? 'bg-blue-900/20 border-blue-500/50' :
                     step.status === 'completed' ? 'bg-green-900/10 border-green-500/30' :
                     'bg-slate-900 border-slate-700'
                  }`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className={`font-semibold text-sm ${
                          step.status === 'completed' ? 'text-green-400' : 
                          step.status === 'processing' ? 'text-blue-400' : 'text-slate-300'
                        }`}>{step.label}</h3>
                        <p className="text-slate-500 text-xs mt-0.5">{step.details}</p>
                      </div>
                      {(step.status === 'completed' || step.status === 'error') && step.report && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStepReport({
                              stepId: parseInt(step.id),
                              stepLabel: step.label,
                              report: step.report!
                            });
                          }}
                          className="ml-1.5 px-2 py-0.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-900/20 hover:bg-blue-900/30 border border-blue-500/50 hover:border-blue-400/70 rounded transition-all"
                          title="Показать результат выполнения"
                        >
                          Результат
                        </button>
                      )}
                    </div>
                    
                    {step.status === 'processing' && (
                      <div className="mt-2 w-full bg-slate-700 rounded-full h-1 overflow-hidden">
                        <div className="bg-blue-500 h-1 rounded-full animate-progress"></div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  const contextCode = (typeof window !== 'undefined' && (window as any).g_context_code) || 'CARL';
                  const historyUrl = `/history.html?context-code=${encodeURIComponent(contextCode)}`;
                  window.open(historyUrl, 'pipeline-history', 'width=1200,height=800,resizable=yes,scrollbars=yes');
                }}
                className="px-3 py-1.5 rounded text-xs font-bold text-white shadow-lg transition-all transform hover:scale-105 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
              >
                История
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={isClearing}
                className={`px-3 py-1.5 rounded text-xs font-bold text-white shadow-lg transition-all transform hover:scale-105 ${
                  isClearing ? 'bg-slate-600 cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500'
                }`}
              >
                {isClearing ? 'Очистка...' : 'Очистить БД'}
              </button>
              <button
                onClick={runPipeline}
                disabled={isRunning}
                className={`px-3 py-1.5 rounded text-xs font-bold text-white shadow-lg transition-all transform hover:scale-105 ${
                  isRunning ? 'bg-slate-600 cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
                }`}
              >
                {isRunning ? 'Processing...' : 'Run Simulation'}
              </button>
            </div>
          </div>

          {/* Info / Theory Panel */}
          <div className="space-y-3">
             <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
                <h3 className="text-sm font-bold text-white mb-2">How Vectorization Works</h3>
                <div className="text-slate-400 text-xs space-y-1.5">
                    <p>
                        1. <span className="text-blue-400 font-bold">Chunking:</span> Code is not split by lines, but by "AiItems" (functions/classes). This preserves context.
                    </p>
                    <p>
                        2. <span className="text-blue-400 font-bold">Description Generation:</span> An LLM reads the code and generates a summary (L2).
                        <br/>
                        <em className="text-slate-500">"This function calculates the Fibonacci sequence recursively."</em>
                    </p>
                    <p>
                        3. <span className="text-blue-400 font-bold">Embedding:</span> The summary + signature is sent to an Embedding Model (e.g., Gemini Embedding) to produce a vector (e.g., `[0.1, -0.5, ...]`).
                    </p>
                    <p>
                        4. <span className="text-blue-400 font-bold">Storage:</span> Vectors are saved in a local `faiss.index` file for millisecond-speed retrieval.
                    </p>
                </div>
             </div>

             <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                <h3 className="text-white font-bold mb-2 text-sm">Configuration</h3>
                <div className="space-y-2">
                    <div>
                        <label className="block text-xs text-slate-500 uppercase mb-0.5">Embedding Model</label>
                        <select className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white h-7">
                            <option>Google Gemini (text-embedding-004)</option>
                            <option>OpenAI (text-embedding-3-small)</option>
                            <option>Local (SentenceTransformers)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 uppercase mb-0.5">Chunk Strategy</label>
                        <select className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white h-7">
                            <option>Semantic (AiItem / Function-based)</option>
                            <option>Fixed Size (512 tokens)</option>
                            <option>File-based</option>
                        </select>
                    </div>
                </div>
             </div>
          </div>
      </div>

      {/* Диалог подтверждения очистки векторной БД */}
      {showClearConfirm && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !isClearing && setShowClearConfirm(false)}
        >
          <div 
            className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-md w-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">
                Очистка векторной базы данных
              </h3>
              {!isClearing && (
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="text-slate-400 hover:text-white transition-colors text-2xl leading-none"
                  title="Закрыть"
                >
                  ×
                </button>
              )}
            </div>

            {/* Содержимое */}
            <div className="p-6">
              <p className="text-slate-300 mb-4">
                Вы уверены, что хотите очистить векторную базу данных?
              </p>
              <p className="text-red-400 text-sm mb-4">
                ⚠️ Это действие нельзя отменить. Все векторы и индексы будут удалены.
              </p>
            </div>

            {/* Футер */}
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button
                onClick={() => setShowClearConfirm(false)}
                disabled={isClearing}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Отмена
              </button>
              <button
                onClick={handleClearVectorDB}
                disabled={isClearing}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isClearing ? 'Очистка...' : 'Очистить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Диалог с результатом выполнения шага */}
      {selectedStepReport && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedStepReport(null)}
        >
          <div 
            className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">
                Результат выполнения: {selectedStepReport.stepLabel}
              </h3>
              <button
                onClick={() => setSelectedStepReport(null)}
                className="text-slate-400 hover:text-white transition-colors text-2xl leading-none"
                title="Закрыть"
              >
                ×
              </button>
            </div>

            {/* Содержимое */}
            <div className="flex-1 overflow-auto p-6">
              <pre className="text-sm text-slate-300 bg-slate-900 rounded-lg p-4 border border-slate-700 overflow-x-auto">
                {JSON.stringify(selectedStepReport.report, null, 2)}
              </pre>
            </div>

            {/* Футер */}
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(selectedStepReport.report, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `step-${selectedStepReport.stepId}-result.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
              >
                Скачать JSON
              </button>
              <button
                onClick={() => setSelectedStepReport(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelineView;