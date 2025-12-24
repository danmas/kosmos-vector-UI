/**
 * Централизованная обработка ошибок pipeline
 */
export class ErrorHandler {
  constructor() {
    this.errorHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Обработать ошибку с контекстом
   */
  handleError(error, context = {}) {
    const errorEntry = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      context,
      type: this.classifyError(error),
      severity: this.determineSeverity(error, context)
    };

    // Добавляем в историю
    this.errorHistory.unshift(errorEntry);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.pop();
    }

    // Логируем в зависимости от серьезности
    switch (errorEntry.severity) {
      case 'critical':
        console.error(`[CRITICAL ERROR] Pipeline ${context.pipelineId || 'unknown'}:`, error);
        break;
      case 'high':
        console.error(`[ERROR] Pipeline ${context.pipelineId || 'unknown'}:`, error.message);
        break;
      case 'medium':
        console.warn(`[WARNING] Pipeline ${context.pipelineId || 'unknown'}:`, error.message);
        break;
      case 'low':
        console.info(`[INFO] Pipeline ${context.pipelineId || 'unknown'}:`, error.message);
        break;
    }

    return errorEntry;
  }

  /**
   * Классифицировать тип ошибки
   */
  classifyError(error) {
    const message = error.message.toLowerCase();
    
    // Ошибки парсинга
    if (message.includes('parse') || message.includes('syntax')) {
      return 'parsing_error';
    }
    
    // Ошибки API
    if (message.includes('api') || message.includes('rate limit') || message.includes('quota')) {
      return 'api_error';
    }
    
    // Ошибки файловой системы
    if (message.includes('enoent') || message.includes('file') || message.includes('directory')) {
      return 'filesystem_error';
    }
    
    // Ошибки сети
    if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
      return 'network_error';
    }
    
    // Ошибки валидации
    if (message.includes('invalid') || message.includes('validation') || message.includes('required')) {
      return 'validation_error';
    }
    
    // Ошибки памяти/ресурсов
    if (message.includes('memory') || message.includes('heap') || message.includes('resource')) {
      return 'resource_error';
    }

    return 'unknown_error';
  }

  /**
   * Определить серьезность ошибки
   */
  determineSeverity(error, context) {
    const errorType = this.classifyError(error);
    const step = context.step;

    // Критические ошибки - останавливают весь pipeline
    if (errorType === 'resource_error' || 
        (errorType === 'filesystem_error' && step === 'parsing') ||
        (errorType === 'api_error' && error.message.includes('authentication'))) {
      return 'critical';
    }

    // Высокая серьезность - могут сильно повлиять на результат
    if (errorType === 'parsing_error' || 
        (errorType === 'api_error' && step === 'enrichment') ||
        errorType === 'validation_error') {
      return 'high';
    }

    // Средняя серьезность - частичное влияние на результат
    if (errorType === 'network_error' || 
        (errorType === 'api_error' && error.message.includes('rate limit'))) {
      return 'medium';
    }

    // Низкая серьезность - минимальное влияние
    return 'low';
  }

  /**
   * Определить стратегию восстановления
   */
  getRecoveryStrategy(errorEntry) {
    const { type, severity, context } = errorEntry;

    switch (type) {
      case 'api_error':
        if (errorEntry.message.includes('rate limit')) {
          return {
            action: 'retry_with_delay',
            delay: this.calculateBackoffDelay(context.retryCount || 0),
            maxRetries: 5
          };
        }
        if (errorEntry.message.includes('quota')) {
          return {
            action: 'pause_and_retry',
            delay: 60000, // 1 минута
            maxRetries: 3
          };
        }
        break;

      case 'network_error':
        return {
          action: 'exponential_backoff',
          baseDelay: 1000,
          maxRetries: 3,
          maxDelay: 10000
        };

      case 'parsing_error':
        return {
          action: 'skip_file',
          continue: true,
          logWarning: true
        };

      case 'filesystem_error':
        if (severity === 'critical') {
          return {
            action: 'abort_pipeline',
            reason: 'Cannot access required files'
          };
        }
        return {
          action: 'skip_file',
          continue: true
        };

      case 'validation_error':
        return {
          action: 'abort_pipeline',
          reason: 'Invalid configuration or input data'
        };

      case 'resource_error':
        return {
          action: 'abort_pipeline',
          reason: 'Insufficient system resources'
        };

      default:
        return {
          action: 'retry',
          maxRetries: 1
        };
    }
  }

  /**
   * Выполнить стратегию восстановления
   */
  async executeRecoveryStrategy(strategy, context) {
    switch (strategy.action) {
      case 'retry_with_delay':
        await this.delay(strategy.delay);
        return { shouldRetry: true, shouldContinue: true };

      case 'pause_and_retry':
        await this.delay(strategy.delay);
        return { shouldRetry: true, shouldContinue: true };

      case 'exponential_backoff':
        const delay = Math.min(
          strategy.baseDelay * Math.pow(2, context.retryCount || 0),
          strategy.maxDelay
        );
        await this.delay(delay);
        return { shouldRetry: true, shouldContinue: true };

      case 'skip_file':
        if (strategy.logWarning) {
          console.warn(`Skipping file due to error: ${context.filePath}`);
        }
        return { shouldRetry: false, shouldContinue: true };

      case 'abort_pipeline':
        console.error(`Aborting pipeline: ${strategy.reason}`);
        return { shouldRetry: false, shouldContinue: false, abort: true };

      case 'retry':
        return { shouldRetry: true, shouldContinue: true };

      default:
        return { shouldRetry: false, shouldContinue: false };
    }
  }

  /**
   * Вычислить задержку для backoff
   */
  calculateBackoffDelay(retryCount) {
    // Экспоненциальная задержка: 1s, 2s, 4s, 8s, 16s
    return Math.min(1000 * Math.pow(2, retryCount), 30000);
  }

  /**
   * Генерировать уникальный ID ошибки
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Получить статистику ошибок
   */
  getErrorStatistics(timeWindow = 3600000) { // 1 час по умолчанию
    const cutoff = Date.now() - timeWindow;
    const recentErrors = this.errorHistory.filter(err => err.timestamp > cutoff);

    const byType = {};
    const bySeverity = {};

    recentErrors.forEach(err => {
      byType[err.type] = (byType[err.type] || 0) + 1;
      bySeverity[err.severity] = (bySeverity[err.severity] || 0) + 1;
    });

    return {
      total: recentErrors.length,
      byType,
      bySeverity,
      timeWindow: timeWindow,
      oldestError: recentErrors[recentErrors.length - 1]?.timestamp,
      newestError: recentErrors[0]?.timestamp
    };
  }

  /**
   * Очистить историю ошибок
   */
  clearHistory() {
    this.errorHistory = [];
  }

  /**
   * Получить последние ошибки
   */
  getRecentErrors(limit = 10) {
    return this.errorHistory.slice(0, limit);
  }

  /**
   * Задержка
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Глобальный экземпляр обработчика ошибок
export const errorHandler = new ErrorHandler();
