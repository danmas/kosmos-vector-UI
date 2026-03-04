import { ServerLog } from '../types';

type LogListener = (log: ServerLog) => void;
type LogLevel = 'INFO' | 'WARN' | 'ERROR';

/**
 * Контекстный логгер (аналог createLogger из kosmos-vector)
 * Возвращает объект с методами info, warn, error с привязанным контекстом
 */
export interface ContextLogger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

const MAX_LOG_BUFFER = 500;

class UiLogger {
  private listeners: Set<LogListener> = new Set();
  /** Буфер всех логов (новые в начале, как в kosmos-vector serverLogs) */
  private buffer: ServerLog[] = [];

  // ─── Подписка ──────────────────────────────────────────────────────────────

  /**
   * Подписаться на новые логи.
   * При подписке немедленно отдаёт всё содержимое буфера (история).
   * Возвращает функцию отписки.
   */
  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    // Отдаём историю в хронологическом порядке (буфер хранится новые-первыми)
    const history = [...this.buffer].reverse();
    history.forEach(log => {
      try { listener(log); } catch {}
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── Внутренний emit ───────────────────────────────────────────────────────

  private emit(log: ServerLog): void {
    // Добавляем в начало буфера (новые первыми)
    this.buffer.unshift(log);
    if (this.buffer.length > MAX_LOG_BUFFER) {
      this.buffer.pop();
    }

    this.listeners.forEach(listener => {
      try {
        listener(log);
      } catch (err) {
        // Не допускаем рекурсии
      }
    });
  }

  private makeId(): string {
    return `ui-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private formatArgs(args: any[]): string {
    return args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  }

  // ─── createLogger — фабрика контекстных логгеров (как в kosmos-vector) ────

  /**
   * Создаёт логгер с привязанным контекстом.
   * Аналог `createLogger(context)` из kosmos-vector/packages/core/logger.js
   *
   * @param context Контекст / категория (например: 'PIPELINE', 'RAG', 'API')
   */
  createLogger(context: string): ContextLogger {
    const log = (level: LogLevel, message: string, args: any[]) => {
      const extra = args.length ? ' ' + this.formatArgs(args) : '';
      const fullMessage = `[${context}] ${message}${extra}`;
      this.logMessage(level, fullMessage);
    };
    return {
      info:  (message, ...args) => log('INFO',  message, args),
      warn:  (message, ...args) => log('WARN',  message, args),
      error: (message, ...args) => log('ERROR', message, args),
    };
  }

  // ─── logRequest ────────────────────────────────────────────────────────────

  /**
   * Логирование REST запроса к DATA_SERVER.
   * Фильтрует частые/шумные запросы.
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
  ): void {
    // Фильтруем частые запросы
    const isPolling = method === 'GET' && url.includes('/api/pipeline/steps/status');
    const isFrequentGet = method === 'GET' && (
      url.includes('/api/stats') ||
      url.includes('/api/items-list') ||
      url.includes('/api/graph')
    );
    const isSuccess = !error && status !== undefined && status < 400;

    if ((isPolling || isFrequentGet) && isSuccess) return;

    let level: LogLevel = 'INFO';
    let message: string;

    if (error) {
      level = 'ERROR';
      message = `[UI] ${method} ${url} → ERROR: ${error}`;
    } else if (status && status >= 400) {
      level = status >= 500 ? 'ERROR' : 'WARN';
      message = `[UI] ${method} ${url} → ${status}`;
    } else {
      message = `[UI] ${method} ${url}${status ? ` → ${status}` : ''}`;
    }

    this.emit({
      id: this.makeId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      source: 'UI',
      details: { method, url, status, error, ...details },
    });
  }

  // ─── logMessage ────────────────────────────────────────────────────────────

  /**
   * Логирование произвольного сообщения.
   * Контекст передаётся в самом message (через createLogger уже проставлен).
   */
  logMessage(level: LogLevel, message: string, details?: Record<string, any>): void {
    // Добавляем префикс [UI] только если нет явного контекстного префикса
    const fullMessage = message.startsWith('[') ? message : `[UI] ${message}`;
    this.emit({
      id: this.makeId(),
      timestamp: new Date().toISOString(),
      level,
      message: fullMessage,
      source: 'UI',
      details: details ? { ...details } : undefined,
    });
  }

  // ─── Утилиты ───────────────────────────────────────────────────────────────

  /**
   * Получить текущий буфер логов в хронологическом порядке (старые первыми).
   */
  getBuffer(): ServerLog[] {
    return [...this.buffer].reverse();
  }

  /**
   * Очистить буфер логов.
   */
  clearBuffer(): void {
    this.buffer = [];
  }
}

// Singleton instance
export const uiLogger = new UiLogger();

/**
 * Быстрый доступ к фабрике контекстных логгеров.
 * Аналог `createLogger` из kosmos-vector.
 *
 * Пример использования:
 *   const log = createLogger('PIPELINE');
 *   log.info('Step 1 started');
 *   log.error('Failed', { reason: err.message });
 */
export const createLogger = (context: string): ContextLogger =>
  uiLogger.createLogger(context);

