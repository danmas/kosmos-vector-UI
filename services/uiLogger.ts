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
    // Фильтруем частые polling запросы - не логируем успешные GET к /api/pipeline/steps/status
    const isPollingRequest = method === 'GET' && url.includes('/api/pipeline/steps/status');
    const isSuccess = !error && status !== undefined && status < 400;
    
    if (isPollingRequest && isSuccess) {
      // Не логируем успешные polling запросы
      return;
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
}

// Singleton instance
export const uiLogger = new UiLogger();

