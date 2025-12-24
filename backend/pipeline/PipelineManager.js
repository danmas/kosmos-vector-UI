import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Pipeline состояния
 */
export const PipelineStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Pipeline шаги
 */
export const PipelineSteps = {
  PARSING: { id: 1, name: 'parsing', label: 'Polyglot Parsing (L0)' },
  DEPENDENCIES: { id: 2, name: 'dependencies', label: 'Dependency Analysis (L1)' },
  ENRICHMENT: { id: 3, name: 'enrichment', label: 'Semantic Enrichment (L2)' },
  VECTORIZATION: { id: 4, name: 'vectorization', label: 'Vectorization' },
  INDEXING: { id: 5, name: 'indexing', label: 'Index Construction' }
};

/**
 * Главный менеджер pipeline обработки
 */
export class PipelineManager extends EventEmitter {
  constructor() {
    super();
    this.pipelines = new Map(); // pipelineId -> PipelineInstance
    this.maxConcurrentPipelines = 3;
    
    // Глобальное хранилище состояния шагов (для независимого запуска)
    this.globalStepsState = new Map(); // stepId -> stepState
    this.globalPipelineInstance = null; // Единый экземпляр для независимых шагов
    this.globalResults = {}; // Результаты выполнения шагов
    
    // История выполнения шагов (stepId -> массив записей истории)
    this.globalStepsHistory = new Map();
  }

  /**
   * Создать и запустить новый pipeline
   */
  async startPipeline(config) {
    const pipelineId = uuidv4();
    
    // Проверяем лимит concurrent pipelines
    const runningPipelines = Array.from(this.pipelines.values())
      .filter(p => p.status === PipelineStatus.RUNNING).length;
      
    if (runningPipelines >= this.maxConcurrentPipelines) {
      throw new Error(`Maximum concurrent pipelines limit reached (${this.maxConcurrentPipelines})`);
    }

    const pipeline = new PipelineInstance(pipelineId, config);
    this.pipelines.set(pipelineId, pipeline);

    // Подписываемся на события pipeline
    pipeline.on('progress', (data) => {
      this.emit('pipeline:progress', { pipelineId, ...data });
    });

    pipeline.on('step:completed', (data) => {
      this.emit('pipeline:step:completed', { pipelineId, ...data });
    });

    pipeline.on('step:failed', (data) => {
      this.emit('pipeline:step:failed', { pipelineId, ...data });
    });

    pipeline.on('completed', (data) => {
      this.emit('pipeline:completed', { pipelineId, ...data });
    });

    pipeline.on('failed', (data) => {
      this.emit('pipeline:failed', { pipelineId, ...data });
    });

    // Запускаем pipeline асинхронно
    setImmediate(() => {
      pipeline.start().catch(error => {
        console.error(`Pipeline ${pipelineId} failed:`, error);
      });
    });

    return {
      pipelineId,
      status: PipelineStatus.RUNNING,
      createdAt: pipeline.createdAt
    };
  }

  /**
   * Получить статус pipeline
   */
  getPipelineStatus(pipelineId) {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    return {
      id: pipelineId,
      status: pipeline.status,
      currentStep: pipeline.currentStep,
      steps: pipeline.getStepsStatus(),
      startedAt: pipeline.startedAt,
      completedAt: pipeline.completedAt,
      error: pipeline.error,
      results: pipeline.results,
      config: pipeline.config
    };
  }

  /**
   * Остановить pipeline
   */
  async cancelPipeline(pipelineId) {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    await pipeline.cancel();
    return { pipelineId, status: pipeline.status };
  }

  /**
   * Получить список всех pipelines
   */
  getAllPipelines() {
    return Array.from(this.pipelines.entries()).map(([id, pipeline]) => ({
      id,
      status: pipeline.status,
      currentStep: pipeline.currentStep,
      startedAt: pipeline.startedAt,
      completedAt: pipeline.completedAt,
      config: {
        projectPath: pipeline.config.projectPath,
        filePatterns: pipeline.config.filePatterns
      }
    }));
  }

  /**
   * Очистить завершенные pipelines (старше 1 часа)
   */
  cleanup() {
    const cutoffTime = Date.now() - (60 * 60 * 1000); // 1 час
    
    for (const [id, pipeline] of this.pipelines) {
      if (pipeline.completedAt && pipeline.completedAt < cutoffTime) {
        this.pipelines.delete(id);
      }
    }
  }

  /**
   * Инициализировать глобальное состояние шагов
   */
  initializeGlobalStepsState() {
    if (this.globalStepsState.size === 0) {
      Object.values(PipelineSteps).forEach(step => {
        this.globalStepsState.set(step.id, {
          id: step.id,
          name: step.name,
          label: step.label,
          status: 'pending',
          progress: 0,
          startedAt: null,
          completedAt: null,
          error: null,
          itemsProcessed: 0,
          totalItems: 0
        });
        // Инициализируем пустую историю для каждого шага
        if (!this.globalStepsHistory.has(step.id)) {
          this.globalStepsHistory.set(step.id, []);
        }
      });
    }
  }

  /**
   * Добавить запись в историю шага
   */
  addHistoryEntry(stepId, entry) {
    if (!this.globalStepsHistory.has(stepId)) {
      this.globalStepsHistory.set(stepId, []);
    }
    
    const history = this.globalStepsHistory.get(stepId);
    history.push({
      timestamp: new Date().toISOString(),
      status: entry.status,
      progress: entry.progress !== undefined ? entry.progress : null,
      itemsProcessed: entry.itemsProcessed !== undefined ? entry.itemsProcessed : null,
      totalItems: entry.totalItems !== undefined ? entry.totalItems : null,
      error: entry.error || null,
      report: entry.report || null
    });
    
    // Ограничиваем размер истории (максимум 1000 записей на шаг)
    if (history.length > 1000) {
      history.shift(); // Удаляем самую старую запись
    }
  }

  /**
   * Запустить отдельный шаг независимо
   */
  async runStep(stepId, config = {}) {
    // Инициализируем состояние шагов если нужно
    this.initializeGlobalStepsState();

    const step = this.globalStepsState.get(stepId);
    if (!step) {
      throw new Error(`Step with id ${stepId} not found`);
    }

    // Если шаг уже выполняется, не запускаем повторно
    if (step.status === 'running') {
      throw new Error(`Step ${step.label} is already running`);
    }

    // Если шаг уже выполнен, разрешаем перезапуск (сбрасываем статус)
    if (step.status === 'completed' || step.status === 'failed') {
      step.status = 'pending';
      step.progress = 0;
      step.startedAt = null;
      step.completedAt = null;
      step.error = null;
      
      // Записываем в историю сброс статуса на pending
      this.addHistoryEntry(stepId, {
        status: 'pending',
        progress: 0,
        itemsProcessed: 0,
        totalItems: 0
      });
    }

    // Создаем или используем существующий глобальный pipeline instance
    if (!this.globalPipelineInstance) {
      const defaultPath = config.projectPath || process.cwd();
      const defaultFilePatterns = config.filePatterns || ['**/*.{py,ts,js,go,java}'];
      
      const pipelineConfig = {
        projectPath: defaultPath,
        filePatterns: defaultFilePatterns,
        selectedFiles: config.selectedFiles || null,
        excludedFiles: config.excludedFiles || [],
        forceReparse: config.forceReparse || false,
        llmModel: config.llmModel || 'gemini-2.5-flash',
        embeddingModel: config.embeddingModel || 'text-embedding-ada-002',
        ...config
      };

      const pipelineId = 'global-steps-pipeline';
      this.globalPipelineInstance = new PipelineInstance(pipelineId, pipelineConfig);
      this.globalPipelineInstance.results = this.globalResults;
      
      // Подписываемся на события для обновления глобального состояния
      this.globalPipelineInstance.on('progress', (data) => {
        const stepState = this.globalStepsState.get(data.step);
        if (stepState) {
          stepState.progress = data.progress;
          stepState.itemsProcessed = data.itemsProcessed;
          stepState.totalItems = data.totalItems;
          
          // Записываем в историю изменения прогресса (только при значительных изменениях или каждые 10%)
          const lastHistory = this.globalStepsHistory.get(data.step);
          if (lastHistory && lastHistory.length > 0) {
            const lastEntry = lastHistory[lastHistory.length - 1];
            const progressDiff = Math.abs((data.progress || 0) - (lastEntry.progress || 0));
            // Записываем если прогресс изменился на 10% или больше, или если это первая запись
            if (progressDiff >= 10 || lastHistory.length === 1) {
              this.addHistoryEntry(data.step, {
                status: 'running',
                progress: data.progress,
                itemsProcessed: data.itemsProcessed,
                totalItems: data.totalItems
              });
            }
          } else {
            // Первая запись прогресса
            this.addHistoryEntry(data.step, {
              status: 'running',
              progress: data.progress,
              itemsProcessed: data.itemsProcessed,
              totalItems: data.totalItems
            });
          }
        }
        this.emit('step:progress', { stepId: data.step, ...data });
      });

      this.globalPipelineInstance.on('step:completed', (data) => {
        // data.step содержит name шага, нужно найти id по name
        const stepInfo = Object.values(PipelineSteps).find(s => s.name === data.step);
        if (stepInfo) {
          const stepState = this.globalStepsState.get(stepInfo.id);
          if (stepState) {
            stepState.status = 'completed';
            stepState.completedAt = Date.now();
            stepState.progress = 100;
          }
          
          // Записываем в историю завершение шага
          this.addHistoryEntry(stepInfo.id, {
            status: 'completed',
            progress: 100,
            itemsProcessed: stepState?.itemsProcessed || null,
            totalItems: stepState?.totalItems || null,
            report: data.result?.report || data.report || null
          });
          
          this.emit('step:completed', { stepId: stepInfo.id, ...data });
        }
      });

      this.globalPipelineInstance.on('step:failed', (data) => {
        // data.step содержит name шага, нужно найти id по name
        const stepInfo = Object.values(PipelineSteps).find(s => s.name === data.step);
        if (stepInfo) {
          const stepState = this.globalStepsState.get(stepInfo.id);
          if (stepState) {
            stepState.status = 'failed';
            stepState.completedAt = Date.now();
            stepState.error = data.error;
          }
          
          // Записываем в историю ошибку шага
          this.addHistoryEntry(stepInfo.id, {
            status: 'failed',
            progress: stepState?.progress || null,
            itemsProcessed: stepState?.itemsProcessed || null,
            totalItems: stepState?.totalItems || null,
            error: data.error || null
          });
          
          this.emit('step:failed', { stepId: stepInfo.id, ...data });
        }
      });
    }

    // Обновляем конфигурацию если нужно
    if (config.projectPath || config.filePatterns) {
      Object.assign(this.globalPipelineInstance.config, config);
    }

    // Находим шаг в pipeline instance
    const pipelineStep = this.globalPipelineInstance.steps.find(s => s.id === stepId);
    if (!pipelineStep) {
      throw new Error(`Step ${stepId} not found in pipeline instance`);
    }

    // Обновляем состояние шага перед запуском
    step.status = 'running';
    step.startedAt = Date.now();
    step.progress = 0;
    step.error = null;
    step.itemsProcessed = 0;
    step.totalItems = 0;
    
    // Записываем в историю изменение статуса на running
    this.addHistoryEntry(stepId, {
      status: 'running',
      progress: 0,
      itemsProcessed: 0,
      totalItems: 0
    });
    
    // Также обновляем состояние в pipeline instance
    pipelineStep.status = 'running';
    pipelineStep.startedAt = Date.now();
    pipelineStep.progress = 0;
    pipelineStep.error = null;
    pipelineStep.itemsProcessed = 0;
    pipelineStep.totalItems = 0;
    
    // Убеждаемся, что результаты предыдущих шагов доступны
    this.globalPipelineInstance.results = { ...this.globalResults };

    // Запускаем шаг асинхронно
    setImmediate(async () => {
      try {
        await this.globalPipelineInstance.executeStep(pipelineStep);
        // Обновляем глобальные результаты
        this.globalResults = { ...this.globalPipelineInstance.results };
      } catch (error) {
        console.error(`Failed to execute step ${stepId}:`, error);
        step.status = 'failed';
        step.error = error.message;
        step.completedAt = Date.now();
      }
    });

    return {
      stepId,
      status: 'running',
      label: step.label
    };
  }

  /**
   * Получить статус всех шагов из глобального хранилища
   */
  getGlobalStepsStatus() {
    this.initializeGlobalStepsState();
    return Array.from(this.globalStepsState.values()).map(step => ({
      id: step.id,
      name: step.name,
      label: step.label,
      status: step.status,
      progress: step.progress,
      itemsProcessed: step.itemsProcessed,
      totalItems: step.totalItems,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      error: step.error
    }));
  }

  /**
   * Получить историю выполнения шагов
   * @param {number|null} stepId - ID шага (1-7) или null для всех шагов
   * @param {number} limit - Максимальное количество записей на шаг (по умолчанию 100, максимум 1000)
   * @returns {Array} Массив объектов с историей шагов
   */
  getGlobalStepsHistory(stepId = null, limit = 100) {
    this.initializeGlobalStepsState();
    
    // Ограничиваем limit максимумом 1000
    const maxLimit = Math.min(limit, 1000);
    
    if (stepId !== null) {
      // Возвращаем историю конкретного шага
      const step = this.globalStepsState.get(stepId);
      if (!step) {
        throw new Error(`Step with id ${stepId} not found`);
      }
      
      const history = this.globalStepsHistory.get(stepId) || [];
      // Берем последние maxLimit записей (история уже отсортирована от старых к новым)
      const limitedHistory = history.slice(-maxLimit);
      
      return [{
        stepId: step.id,
        stepName: step.name,
        history: limitedHistory
      }];
    } else {
      // Возвращаем историю всех шагов
      return Array.from(this.globalStepsState.values()).map(step => {
        const history = this.globalStepsHistory.get(step.id) || [];
        // Берем последние maxLimit записей
        const limitedHistory = history.slice(-maxLimit);
        
        return {
          stepId: step.id,
          stepName: step.name,
          history: limitedHistory
        };
      });
    }
  }
}

/**
 * Отдельный экземпляр pipeline
 */
class PipelineInstance extends EventEmitter {
  constructor(id, config) {
    super();
    this.id = id;
    this.config = {
      projectPath: config.projectPath || process.cwd(),
      filePatterns: config.filePatterns || ['**/*.{py,ts,js,go,java}'],
      forceReparse: config.forceReparse || false,
      llmModel: config.llmModel || 'gemini-2.5-flash',
      embeddingModel: config.embeddingModel || 'text-embedding-ada-002',
      ...config
    };

    this.status = PipelineStatus.IDLE;
    this.currentStep = 0;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.error = null;
    this.results = {};
    
    // Инициализируем состояние шагов
    this.steps = Object.values(PipelineSteps).map(step => ({
      ...step,
      status: 'pending',
      progress: 0,
      startedAt: null,
      completedAt: null,
      error: null,
      itemsProcessed: 0,
      totalItems: 0
    }));

    this.cancelled = false;
  }

  /**
   * Запустить pipeline
   */
  async start() {
    this.status = PipelineStatus.RUNNING;
    this.startedAt = Date.now();
    
    console.log(`[Pipeline ${this.id}] Starting with config:`, this.config);

    try {
      // Выполняем шаги последовательно
      for (const step of this.steps) {
        if (this.cancelled) {
          this.status = PipelineStatus.CANCELLED;
          return;
        }

        await this.executeStep(step);
        
        // Проверяем, не произошла ли ошибка
        if (step.status === 'failed') {
          throw new Error(`Step ${step.name} failed: ${step.error}`);
        }
      }

      this.status = PipelineStatus.COMPLETED;
      this.completedAt = Date.now();
      this.emit('completed', { results: this.results });
      
      console.log(`[Pipeline ${this.id}] Completed successfully`);

    } catch (error) {
      this.status = PipelineStatus.FAILED;
      this.completedAt = Date.now();
      this.error = error.message;
      
      console.error(`[Pipeline ${this.id}] Failed:`, error);
      this.emit('failed', { error: error.message });

      // Выполняем rollback для частично выполненных шагов
      await this.rollback();
    }
  }

  /**
   * Выполнить отдельный шаг
   */
  async executeStep(step) {
    this.currentStep = step.id;
    step.status = 'running';
    step.startedAt = Date.now();
    
    console.log(`[Pipeline ${this.id}] Starting step: ${step.label}`);
    
    try {
      // Динамически загружаем исполнитель шага
      const { StepExecutor } = await import('./StepExecutor.js');
      const executor = new StepExecutor(this.config);
      
      // Подписываемся на прогресс шага
      executor.on('progress', (progress) => {
        step.progress = progress.percentage;
        step.itemsProcessed = progress.itemsProcessed;
        step.totalItems = progress.totalItems;
        
        this.emit('progress', {
          step: step.id,
          stepName: step.name,
          progress: progress.percentage,
          message: progress.message,
          itemsProcessed: progress.itemsProcessed,
          totalItems: progress.totalItems
        });
      });

      // Выполняем шаг в зависимости от его типа
      let result;
      switch (step.name) {
        case 'parsing':
          result = await executor.executeParsing(this.results);
          break;
        case 'dependencies':
          result = await executor.executeDependencyAnalysis(this.results);
          break;
        case 'enrichment':
          result = await executor.executeSemanticEnrichment(this.results);
          break;
        case 'vectorization':
          result = await executor.executeVectorization(this.results);
          break;
        case 'indexing':
          result = await executor.executeIndexing(this.results);
          break;
        default:
          throw new Error(`Unknown step: ${step.name}`);
      }

      // Сохраняем результат
      this.results[step.name] = result;
      
      step.status = 'completed';
      step.completedAt = Date.now();
      step.progress = 100;
      
      console.log(`[Pipeline ${this.id}] Completed step: ${step.label}`);
      this.emit('step:completed', { step: step.name, result });

    } catch (error) {
      step.status = 'failed';
      step.completedAt = Date.now();
      step.error = error.message;
      
      console.error(`[Pipeline ${this.id}] Step ${step.label} failed:`, error);
      this.emit('step:failed', { step: step.name, error: error.message });
      
      throw error; // Перебрасываем ошибку для остановки pipeline
    }
  }

  /**
   * Отменить pipeline
   */
  async cancel() {
    this.cancelled = true;
    this.status = PipelineStatus.CANCELLED;
    this.completedAt = Date.now();
    
    console.log(`[Pipeline ${this.id}] Cancelled by user`);
    
    // Выполняем rollback
    await this.rollback();
  }

  /**
   * Rollback частично выполненных шагов
   */
  async rollback() {
    console.log(`[Pipeline ${this.id}] Performing rollback...`);
    
    try {
      // Очищаем временные файлы и состояние
      if (this.results.parsing?.tempFiles) {
        // Удаляем временные файлы парсинга
      }
      
      if (this.results.indexing?.indexPath) {
        // Удаляем частично созданный индекс
      }
      
      // Очищаем результаты
      this.results = {};
      
      console.log(`[Pipeline ${this.id}] Rollback completed`);
    } catch (error) {
      console.error(`[Pipeline ${this.id}] Rollback failed:`, error);
    }
  }

  /**
   * Получить статус всех шагов
   */
  getStepsStatus() {
    return this.steps.map(step => ({
      id: step.id,
      name: step.name,
      label: step.label,
      status: step.status,
      progress: step.progress,
      itemsProcessed: step.itemsProcessed,
      totalItems: step.totalItems,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      error: step.error
    }));
  }
}

// Глобальный экземпляр менеджера
export const pipelineManager = new PipelineManager();

// Периодическая очистка
setInterval(() => {
  pipelineManager.cleanup();
}, 15 * 60 * 1000); // Каждые 15 минут
