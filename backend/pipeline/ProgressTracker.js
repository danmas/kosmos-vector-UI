import { EventEmitter } from 'events';

/**
 * Отслеживание прогресса pipeline с историей и метриками
 */
export class ProgressTracker extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // pipelineId -> ProgressSession
  }

  /**
   * Начать отслеживание нового pipeline
   */
  startTracking(pipelineId, config) {
    const session = new ProgressSession(pipelineId, config);
    this.sessions.set(pipelineId, session);
    
    // Подписываемся на события сессии
    session.on('progress', (data) => {
      this.emit('progress', { pipelineId, ...data });
    });
    
    session.on('step:started', (data) => {
      this.emit('step:started', { pipelineId, ...data });
    });
    
    session.on('step:completed', (data) => {
      this.emit('step:completed', { pipelineId, ...data });
    });
    
    return session;
  }

  /**
   * Получить сессию отслеживания
   */
  getSession(pipelineId) {
    return this.sessions.get(pipelineId);
  }

  /**
   * Завершить отслеживание
   */
  stopTracking(pipelineId) {
    const session = this.sessions.get(pipelineId);
    if (session) {
      session.complete();
      this.sessions.delete(pipelineId);
    }
  }

  /**
   * Получить статистику по всем активным pipeline
   */
  getGlobalStats() {
    const activeSessions = Array.from(this.sessions.values())
      .filter(session => session.isActive());
    
    return {
      activePipelines: activeSessions.length,
      totalItemsProcessed: activeSessions.reduce((sum, s) => sum + s.getTotalItemsProcessed(), 0),
      averageProgress: activeSessions.length > 0 
        ? activeSessions.reduce((sum, s) => sum + s.getOverallProgress(), 0) / activeSessions.length
        : 0,
      estimatedTimeRemaining: Math.max(...activeSessions.map(s => s.getEstimatedTimeRemaining())),
      currentSteps: activeSessions.map(s => ({
        pipelineId: s.pipelineId,
        currentStep: s.getCurrentStep(),
        progress: s.getOverallProgress()
      }))
    };
  }
}

/**
 * Сессия отслеживания для отдельного pipeline
 */
class ProgressSession extends EventEmitter {
  constructor(pipelineId, config) {
    super();
    this.pipelineId = pipelineId;
    this.config = config;
    this.startTime = Date.now();
    this.endTime = null;
    
    // История прогресса по шагам
    this.steps = [
      { id: 1, name: 'parsing', label: 'Polyglot Parsing (L0)', progress: 0, startTime: null, endTime: null, itemsProcessed: 0, totalItems: 0 },
      { id: 2, name: 'dependencies', label: 'Dependency Analysis (L1)', progress: 0, startTime: null, endTime: null, itemsProcessed: 0, totalItems: 0 },
      { id: 3, name: 'enrichment', label: 'Semantic Enrichment (L2)', progress: 0, startTime: null, endTime: null, itemsProcessed: 0, totalItems: 0 },
      { id: 4, name: 'vectorization', label: 'Vectorization', progress: 0, startTime: null, endTime: null, itemsProcessed: 0, totalItems: 0 },
      { id: 5, name: 'indexing', label: 'Index Construction', progress: 0, startTime: null, endTime: null, itemsProcessed: 0, totalItems: 0 }
    ];
    
    this.currentStepIndex = 0;
    this.progressHistory = []; // Детальная история изменений прогресса
    this.performanceMetrics = {
      itemsPerSecond: 0,
      estimatedTotalTime: 0,
      averageStepTime: 0
    };
  }

  /**
   * Обновить прогресс текущего шага
   */
  updateProgress(stepName, progress, message = '', itemsProcessed = 0, totalItems = 0) {
    const step = this.steps.find(s => s.name === stepName);
    if (!step) {
      throw new Error(`Unknown step: ${stepName}`);
    }

    // Обновляем данные шага
    const oldProgress = step.progress;
    step.progress = Math.max(0, Math.min(100, progress));
    step.itemsProcessed = itemsProcessed;
    step.totalItems = totalItems;

    // Если это первое обновление шага, помечаем время старта
    if (!step.startTime && progress > 0) {
      step.startTime = Date.now();
      this.emit('step:started', { step: stepName, timestamp: step.startTime });
    }

    // Если шаг завершен, помечаем время окончания
    if (progress >= 100 && !step.endTime) {
      step.endTime = Date.now();
      this.emit('step:completed', { step: stepName, duration: step.endTime - step.startTime });
    }

    // Записываем в историю
    const historyEntry = {
      timestamp: Date.now(),
      step: stepName,
      progress: step.progress,
      message,
      itemsProcessed,
      totalItems,
      progressDelta: step.progress - oldProgress
    };
    
    this.progressHistory.push(historyEntry);
    
    // Ограничиваем размер истории
    if (this.progressHistory.length > 1000) {
      this.progressHistory = this.progressHistory.slice(-500);
    }

    // Обновляем метрики производительности
    this.updatePerformanceMetrics();

    // Отправляем событие прогресса
    this.emit('progress', {
      step: stepName,
      stepId: step.id,
      stepLabel: step.label,
      progress: step.progress,
      message,
      itemsProcessed,
      totalItems,
      overallProgress: this.getOverallProgress(),
      estimatedTimeRemaining: this.getEstimatedTimeRemaining(),
      performance: this.performanceMetrics
    });
  }

  /**
   * Получить общий прогресс pipeline
   */
  getOverallProgress() {
    const totalSteps = this.steps.length;
    const completedSteps = this.steps.filter(s => s.progress >= 100).length;
    const currentStepProgress = this.getCurrentStep()?.progress || 0;
    
    return Math.round((completedSteps * 100 + currentStepProgress) / totalSteps);
  }

  /**
   * Получить текущий шаг
   */
  getCurrentStep() {
    return this.steps.find(s => s.progress < 100 && s.progress > 0) || 
           this.steps.find(s => s.progress < 100) ||
           this.steps[this.steps.length - 1];
  }

  /**
   * Получить общее количество обработанных элементов
   */
  getTotalItemsProcessed() {
    return this.steps.reduce((sum, step) => sum + step.itemsProcessed, 0);
  }

  /**
   * Получить оценку оставшегося времени
   */
  getEstimatedTimeRemaining() {
    const overallProgress = this.getOverallProgress();
    if (overallProgress <= 0) return 0;
    
    const elapsedTime = Date.now() - this.startTime;
    const estimatedTotalTime = (elapsedTime / overallProgress) * 100;
    
    return Math.max(0, estimatedTotalTime - elapsedTime);
  }

  /**
   * Обновить метрики производительности
   */
  updatePerformanceMetrics() {
    const now = Date.now();
    const elapsedTime = (now - this.startTime) / 1000; // в секундах
    
    if (elapsedTime > 0) {
      const totalItems = this.getTotalItemsProcessed();
      this.performanceMetrics.itemsPerSecond = totalItems / elapsedTime;
    }

    // Вычисляем среднее время на шаг
    const completedSteps = this.steps.filter(s => s.endTime && s.startTime);
    if (completedSteps.length > 0) {
      const totalStepTime = completedSteps.reduce((sum, step) => sum + (step.endTime - step.startTime), 0);
      this.performanceMetrics.averageStepTime = totalStepTime / completedSteps.length;
    }

    // Оценка общего времени выполнения
    const overallProgress = this.getOverallProgress();
    if (overallProgress > 5) { // Достаточно данных для оценки
      const elapsedMs = now - this.startTime;
      this.performanceMetrics.estimatedTotalTime = (elapsedMs / overallProgress) * 100;
    }
  }

  /**
   * Получить детальную статистику
   */
  getDetailedStats() {
    return {
      pipelineId: this.pipelineId,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime ? (this.endTime - this.startTime) : (Date.now() - this.startTime),
      overallProgress: this.getOverallProgress(),
      currentStep: this.getCurrentStep(),
      steps: this.steps.map(step => ({
        ...step,
        duration: step.endTime && step.startTime ? (step.endTime - step.startTime) : null,
        itemsPerSecond: step.endTime && step.startTime && step.itemsProcessed > 0 
          ? step.itemsProcessed / ((step.endTime - step.startTime) / 1000)
          : 0
      })),
      performanceMetrics: this.performanceMetrics,
      recentHistory: this.progressHistory.slice(-10) // Последние 10 событий
    };
  }

  /**
   * Получить историю прогресса за определенный период
   */
  getProgressHistory(timeWindow = 300000) { // 5 минут по умолчанию
    const cutoff = Date.now() - timeWindow;
    return this.progressHistory.filter(entry => entry.timestamp > cutoff);
  }

  /**
   * Отметить pipeline как завершенный
   */
  complete() {
    this.endTime = Date.now();
    
    // Убеждаемся, что все шаги отмечены как завершенные
    this.steps.forEach(step => {
      if (step.progress < 100) {
        step.progress = 100;
        if (!step.endTime) {
          step.endTime = this.endTime;
        }
      }
    });
    
    this.updatePerformanceMetrics();
  }

  /**
   * Проверить, активен ли pipeline
   */
  isActive() {
    return !this.endTime && this.getOverallProgress() < 100;
  }

  /**
   * Получить краткую сводку для API
   */
  getSummary() {
    return {
      pipelineId: this.pipelineId,
      overallProgress: this.getOverallProgress(),
      currentStep: this.getCurrentStep()?.name,
      currentStepProgress: this.getCurrentStep()?.progress,
      estimatedTimeRemaining: this.getEstimatedTimeRemaining(),
      itemsProcessed: this.getTotalItemsProcessed(),
      isActive: this.isActive()
    };
  }
}

// Глобальный трекер прогресса
export const progressTracker = new ProgressTracker();
