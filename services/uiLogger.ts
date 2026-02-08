import { ServerLog } from '../types';

type LogListener = (log: ServerLog) => void;

class UiLogger {
  private listeners: Set<LogListener> = new Set();

  /**
   * Подписка на логи UI
   */
  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Логирование REST запроса к DATA_SERVER
   */
  logRequest(
    method: string, 
    url: string, 
    status?: number, 
    error?: string,
    details?: {
      statusText?: string;
      headers?: Record<string, string>;
      requestBody?: any;
      responseBody?: any;
      duration?: number;
      [key: string]: any;
    }
  ) {
    // Фильтруем частые запросы - не логируем успешные GET к часто вызываемым эндпоинтам
    const isPollingRequest = method === 'GET' && url.includes('/api/pipeline/steps/status');
    const isFrequentGet = method === 'GET' && (
      url.includes('/api/stats') ||
      url.includes('/api/items-list') ||
      url.includes('/api/graph')
    );
    const isSuccess = !error && status !== undefined && status < 400;

    if (isPollingRequest && isSuccess) {
      return;
    }
    if (isFrequentGet && isSuccess) {
      return; // Слишком много логов от Dashboard/Inspector/Graph
    }
    
    const timestamp = new Date().toISOString();
    const id = `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let level: 'INFO' | 'ERROR' | 'WARN' = 'INFO';
    let message = '';
    
    if (error) {
      level = 'ERROR';
      message = `[UI] ${method} ${url} → ERROR: ${error}`;
    } else if (status && status >= 400) {
      level = status >= 500 ? 'ERROR' : 'WARN';
      message = `[UI] ${method} ${url} → ${status}`;
    } else {
      message = `[UI] ${method} ${url}${status ? ` → ${status}` : ''}`;
    }
    
    const log: ServerLog = {
      id,
      timestamp,
      level,
      message,
      source: 'UI',
      details: {
        method,
        url,
        status,
        error,
        ...details
      }
    };
    
    // Уведомляем всех подписчиков
    this.listeners.forEach(listener => {
      try {
        listener(log);
      } catch (err) {
        console.error('[UiLogger] Error in listener:', err);
      }
    });
  }

  /**
   * Логирование произвольного сообщения (прогресс, статус и т.д.)
   */
  logMessage(level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: Record<string, any>) {
    const timestamp = new Date().toISOString();
    const id = `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const log: ServerLog = {
      id,
      timestamp,
      level,
      message: `[UI] ${message}`,
      source: 'UI',
      details: details ? { ...details } : undefined
    };
    this.listeners.forEach(listener => {
      try {
        listener(log);
      } catch (err) {
        console.error('[UiLogger] Error in listener:', err);
      }
    });
  }
}

// Singleton instance
export const uiLogger = new UiLogger();

