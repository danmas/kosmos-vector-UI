import React, { useState, useEffect, useRef } from 'react';
import { OntologyBuilderStatus, PipelineStep } from '../types';
import { apiClient } from '../services/apiClient';
import { useDataCache } from '../lib/context/DataCacheContext';
import OntologyBuilderDialog from './OntologyBuilderDialog';

/** Steps without a real runner — shown but not clickable */
const DISABLED_STEP_IDS = new Set([3, 5]);

const STEP_DETAILS: Record<number, string> = {
  1: 'Parsing AST for .py, .ts, .go, .java files...',
  2: 'Resolving imports, class hierarchy, and calls...',
  3: 'Не реализовано (L2 enrichment) — шаг отключён',
  4: 'Creating embeddings (text-embedding-ada-002 or Gecko)...',
  5: 'Не реализовано (отдельный indexing) — шаг отключён; индекс = pgvector после Step 4',
  6: 'Interactive ontology builder from vectorized reality (not a batch runner)...'
};

const STEP_LABELS: Record<number, string> = {
  1: '+Polyglot Parsing (L0)',
  2: '+Dependency Analysis (L1)',
  3: '+Semantic Enrichment (L2)',
  4: '+Vectorization',
  5: '+Index Construction',
  6: '+Ontology Builder'
};

interface PipelineViewProps {
  onOpenLogs?: () => void;
}

const PipelineView: React.FC<PipelineViewProps> = ({ onOpenLogs }) => {
  const { invalidate, prefetchAll } = useDataCache();
  const [isRunning, setIsRunning] = useState(false);
  const [stepDefinitions, setStepDefinitions] = useState<import('../types').PipelineStepDefinition[]>([]);
  const [contextConfig, setContextConfig] = useState<import('../types').PipelineContextConfig | null>(null);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState<Set<number>>(new Set());
  const [selectedStepReport, setSelectedStepReport] = useState<{ stepId: number; stepLabel: string; report: object } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const [showOntologyBuilder, setShowOntologyBuilder] = useState(false);
  const [builderStatus, setBuilderStatus] = useState<OntologyBuilderStatus | null>(null);

  // Ref для отслеживания предыдущих статусов шагов (чтобы определить переход в completed)
  const prevStepsRef = useRef<PipelineStep[]>(steps);

  // Загрузка статуса шагов с сервера
  const fetchStepsStatus = async () => {
    try {
      const response = await apiClient.getPipelineStepsStatus();
      if (response.success && response.steps) {
        const serverSteps = response.steps;
        const s6 = serverSteps.find((s: any) => s.id === 6);
        if (s6?.builderStatus) {
          setBuilderStatus(s6.builderStatus as OntologyBuilderStatus);
        }
        // Side effects (invalidate/prefetch) MUST NOT run inside setState updater
        let shouldRefreshCache = false;
        let completedLabels: string[] = [];

        setSteps(prevSteps => {
          // If server returned new step ids (e.g. Step 6) missing from local state, merge
          const knownIds = new Set(prevSteps.map(p => p.id));
          let base = prevSteps;
          for (const ss of serverSteps) {
            if (!knownIds.has(String(ss.id))) {
              base = [
                ...base,
                {
                  id: String(ss.id),
                  label: ss.label || STEP_LABELS[ss.id] || `Step ${ss.id}`,
                  status: 'pending' as const,
                  details: STEP_DETAILS[ss.id]
                }
              ];
            }
          }
          const newSteps = base.map(prevStep => {
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

              const gateBlocked = prevStep.id === '6' && (serverStep as any).builderStatus?.gated;
              let details = prevStep.details;
              if (prevStep.id === '6') {
                const bs = (serverStep as any).builderStatus as OntologyBuilderStatus | undefined;
                if (bs?.gated) {
                  details = 'Заблокировано: сначала векторизация (Step 4)';
                } else if (bs) {
                  details = `Понятий в БД: ${bs.conceptsInDb}; draft: ${bs.draftFiles}; verified: ${bs.verifiedFiles}`;
                }
              }

              return {
                ...prevStep,
                status: gateBlocked && status === 'pending' ? 'pending' : status,
                details,
                // label берётся из context-definition (loadContextData), не перезаписываем из status endpoint
                report: (serverStep as any).report || null
              };
            }
            return prevStep;
          });

          // Detect processing → completed (for cache refresh after setState)
          const previousSteps = prevStepsRef.current;
          newSteps.forEach((newStep, index) => {
            const prevStep = previousSteps[index];
            if (prevStep && prevStep.status === 'processing' && newStep.status === 'completed') {
              shouldRefreshCache = true;
              completedLabels.push(`${newStep.id} (${newStep.label})`);
            }
          });

          prevStepsRef.current = newSteps;
          return newSteps;
        });

        if (shouldRefreshCache) {
          completedLabels.forEach((label) => {
            console.log(`[PipelineView] Step ${label} completed, invalidating cache...`);
          });
          // Defer so we are not inside render / setState of PipelineView
          queueMicrotask(() => {
            invalidate();
            prefetchAll().catch(err => {
              console.warn('[PipelineView] Failed to prefetch data after step completion:', err);
            });
          });
        }
      }
    } catch (error) {
      // Если API недоступен, используем локальное состояние
      console.warn('Failed to fetch steps status:', error);
    }
  };

  // Загрузка определений и конфигурации
  const loadContextData = async () => {
    try {
      const dbPromise = apiClient.getPipelineContextDefinition();
      const configPromise = apiClient.getPipelineContextConfig();

      const [dbRes, configRes] = await Promise.all([dbPromise, configPromise]);

      if (dbRes.steps) {
        setStepDefinitions(dbRes.steps);
        // Всегда обновляем steps на основе определений с сервера (labels могут измениться)
        setSteps(prev => {
          const byId = new Map(prev.map(s => [s.id, s]));
          return dbRes.steps.map(s => {
            const existing = byId.get(s.id.toString());
            if (existing) {
              return {
                ...existing,
                label: s.label,
                details: s.description
              };
            }
            return {
              id: s.id.toString(),
              label: s.label,
              status: 'pending' as const,
              details: s.description
            };
          });
        });
      }

      if (configRes) {
        setContextConfig(configRes);
      }
    } catch (error) {
      console.error('Failed to load context data:', error);
    }
  };

  // Polling для обновления статуса
  useEffect(() => {
    loadContextData();
    fetchStepsStatus(); // Загружаем сразу
    const interval = setInterval(fetchStepsStatus, 2000); // Обновляем каждые 2 секунды
    return () => clearInterval(interval);
  }, []);

  const updateContextConfig = async (stepName: string, updates: any) => {
    if (!contextConfig) return;

    const newConfig = {
      ...contextConfig,
      [stepName]: {
        ...contextConfig[stepName],
        ...updates
      }
    };

    setContextConfig(newConfig);
    setIsUpdatingConfig(true);
    try {
      await apiClient.updatePipelineContextConfig(newConfig);
    } catch (error) {
      console.error('Failed to update context config:', error);
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  // Запуск отдельного шага (Step 6 opens builder dialog instead of runner)
  const runStep = async (stepId: number) => {
    if (DISABLED_STEP_IDS.has(stepId)) {
      return;
    }

    if (stepId === 6) {
      if (builderStatus?.gated) {
        alert(builderStatus.gateReason || 'Сначала выполните векторизацию (Step 4)');
        return;
      }
      setShowOntologyBuilder(true);
      return;
    }

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

  // Реальный запуск pipeline на сервере: Step 1 -> Step 2 (статусы приходят через polling)
  const runPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    onOpenLogs?.();
    setSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));
    try {
      await apiClient.startPipeline('incremental');
    } catch (error) {
      console.error('Failed to start pipeline:', error);
      alert('Ошибка запуска pipeline: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsRunning(false);
    }
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
            {steps.map((step, index) => {
              const stepIdNum = parseInt(step.id, 10);
              const isDisabledStep = DISABLED_STEP_IDS.has(stepIdNum);
              const isGatedBuilder = step.id === '6' && !!builderStatus?.gated;
              const details =
                isDisabledStep
                  ? (STEP_DETAILS[stepIdNum] || step.details)
                  : step.details;

              return (
              <div key={step.id} className={`relative pl-8 ${isDisabledStep ? 'opacity-45' : ''}`}>
                {/* Connector Line */}
                {index !== steps.length - 1 && (
                  <div className={`absolute left-[15px] top-6 bottom-[-12px] w-0.5 ${step.status === 'completed' ? 'bg-green-500' : 'bg-slate-700'
                    }`} />
                )}

                {/* Status Icon; Step 3/5 disabled; Step 6 opens Ontology Builder dialog */}
                <div
                  onClick={() => {
                    if (isDisabledStep) return;
                    runStep(stepIdNum);
                  }}
                  className={`absolute left-0 top-0.5 w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 bg-slate-800 transition-all text-xs ${
                      isDisabledStep
                        ? 'border-slate-700 text-slate-600 cursor-not-allowed'
                        : isGatedBuilder
                        ? 'border-amber-500 text-amber-500 cursor-not-allowed opacity-70'
                        : step.status === 'completed' ? 'border-green-500 text-green-500 hover:border-green-400 hover:bg-green-900/20 cursor-pointer' :
                      step.status === 'processing' ? 'border-blue-500 text-blue-500 animate-pulse cursor-wait' :
                        step.status === 'error' ? 'border-red-500 text-red-500 hover:border-red-400 hover:bg-red-900/20 cursor-pointer' :
                          'border-slate-600 text-slate-600 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-900/20 cursor-pointer'
                    }`}
                  title={
                    isDisabledStep
                      ? 'Шаг не реализован и отключён'
                      : step.id === '6'
                      ? (builderStatus?.gated
                        ? (builderStatus.gateReason || 'Сначала векторизация')
                        : 'Open Ontology Builder')
                      : (step.status === 'processing' ? 'Processing...' : `Click to run ${step.label}`)
                  }
                >
                  {isDisabledStep ? '–' :
                    step.status === 'completed' ? '✓' :
                    step.status === 'processing' ? '↻' :
                      (index + 1)}
                </div>

                {/* Content */}
                <div className={`p-2 rounded-lg border transition-all ${
                    isDisabledStep ? 'bg-slate-900/50 border-slate-800' :
                    step.status === 'processing' ? 'bg-blue-900/20 border-blue-500/50' :
                    step.status === 'completed' ? 'bg-green-900/10 border-green-500/30' :
                      'bg-slate-900 border-slate-700'
                  }`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className={`font-semibold text-sm ${
                          isDisabledStep ? 'text-slate-500' :
                          step.status === 'completed' ? 'text-green-400' :
                          step.status === 'processing' ? 'text-blue-400' : 'text-slate-300'
                        }`}>
                        {step.label}
                        {isDisabledStep && (
                          <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-slate-600 border border-slate-700 rounded px-1 py-0.5">
                            disabled
                          </span>
                        )}
                      </h3>
                      <p className="text-slate-500 text-xs mt-0.5">{details}</p>
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

                  {step.status === 'processing' && !isDisabledStep && (
                    <div className="mt-2 w-full bg-slate-700 rounded-full h-1 overflow-hidden">
                      <div className="bg-blue-500 h-1 rounded-full animate-progress"></div>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
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
              className={`px-3 py-1.5 rounded text-xs font-bold text-white shadow-lg transition-all transform hover:scale-105 ${isClearing ? 'bg-slate-600 cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500'
                }`}
            >
              {isClearing ? 'Очистка...' : 'Очистить БД'}
            </button>
            <button
              onClick={runPipeline}
              disabled={isRunning}
              className={`px-3 py-1.5 rounded text-xs font-bold text-white shadow-lg transition-all transform hover:scale-105 ${isRunning ? 'bg-slate-600 cursor-not-allowed opacity-50' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
                }`}
            >
              {isRunning ? 'Starting...' : 'Run Pipeline (1→2)'}
            </button>
          </div>
        </div>

        {/* Info / Theory Panel */}
        <div className="space-y-3">
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-700">
            <h3 className="text-sm font-bold text-white mb-2">How Vectorization Works</h3>
            <div className="text-slate-400 text-xs space-y-1.5">
              <p>
                1. <span className="text-blue-400 font-bold">Chunking:</span> код режется не по строкам, а по AI Items (функции/классы/секции документов) — контекст сущности сохраняется целиком.
              </p>
              <p>
                2. <span className="text-blue-400 font-bold">Step 1 → Step 2:</span> загрузчики создают AI Items и L0-чанки, затем резолвятся L1-зависимости и строится граф связей (calls, reads from, updates...).
              </p>
              <p>
                3. <span className="text-blue-400 font-bold">Embedding (Step 4):</span> текст чанка отправляется в модель эмбеддингов (OpenAI при USE_OPENAI=true, иначе SimpleEmbeddings) — получается вектор 1536.
              </p>
              <p>
                4. <span className="text-blue-400 font-bold">Storage:</span> вектора хранятся в PostgreSQL (pgvector, таблица kosmos.chunk_vector), поиск — косинусная близость с ivfflat-индексом.
              </p>
              <p>
                5. <span className="text-emerald-400 font-bold">Ontology:</span> поверх чанков живёт онтологический уровень — понятия домена с grounding в код (стратегия «Ontology» в RAG Test).
              </p>
            </div>
          </div>

          <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
            <h3 className="text-white font-bold mb-2 text-sm flex justify-between items-center">
              Configuration
              {isUpdatingConfig && <span className="text-[10px] text-blue-400 animate-pulse font-normal">Saving...</span>}
            </h3>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-slate-500 uppercase mb-0.5">Embedding Model</label>
                <select
                  value={contextConfig?.vectorization?.embeddingModel || 'text-embedding-004'}
                  onChange={(e) => updateContextConfig('vectorization', { embeddingModel: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white h-7 focus:border-blue-500 outline-none"
                >
                  <option value="text-embedding-004">Google Gemini (text-embedding-004)</option>
                  <option value="text-embedding-3-small">OpenAI (text-embedding-3-small)</option>
                  <option value="local">Local (SentenceTransformers)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 uppercase mb-0.5">Chunk Strategy</label>
                <select
                  value={contextConfig?.indexing?.strategy || 'Semantic'}
                  onChange={(e) => updateContextConfig('indexing', { strategy: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white h-7 focus:border-blue-500 outline-none"
                >
                  <option value="Semantic">Semantic (AiItem / Function-based)</option>
                  <option value="FixedSize">Fixed Size (512 tokens)</option>
                  <option value="FileBased">File-based</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 uppercase mb-0.5">LLM Model (Enrichment)</label>
                <select
                  value={contextConfig?.enrichment?.llmModel || 'gemini-2.5-flash'}
                  onChange={(e) => updateContextConfig('enrichment', { llmModel: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white h-7 focus:border-blue-500 outline-none"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  <option value="gpt-4o">GPT-4o</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <OntologyBuilderDialog
        isOpen={showOntologyBuilder}
        onClose={() => {
          setShowOntologyBuilder(false);
          fetchStepsStatus();
        }}
      />

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