import { AiItem, AiItemSummary, ChatMessage, ProjectFile, KnowledgeBaseConfig, FileSelectionRequest, LogicAnalysisResponse, LogicGraphResponse } from '../types';
import { MOCK_AI_ITEMS } from '../constants';
import { validateApiResponse, ValidationResult } from './contractValidator';
import { uiLogger } from './uiLogger';

export interface DashboardStats {
  totalItems: number;
  totalDeps: number;
  averageDependencyDensity: string;
  typeStats: { name: string; count: number }[];
  languageStats: { name: string; value: number }[];
  vectorIndexSize: string;
  lastScan: string;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    type: string;
    language: string;
    filePath: string;
    l2_desc: string;
  }>;
  links: Array<{
    source: string;
    target: string;
    label?: string | null;
  }>;
}

export interface ChatResponse {
  response: string;
  usedContextIds: string[];
  timestamp: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  private baseUrl: string;
  private isDemoMode: boolean;
  private contractValidationEnabled: boolean;

  constructor(baseUrl: string = '', demoMode: boolean = false) {
    this.baseUrl = baseUrl;
    this.isDemoMode = demoMode;
    // Валидация контракта включена по умолчанию в development режиме
    this.contractValidationEnabled = import.meta.env.DEV;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // If demo mode is explicitly enabled, throw error to indicate no API available
    if (this.isDemoMode) {
      throw new ApiError('Demo mode is active - API not available', 503, 'DEMO_MODE');
    }

    // Получаем context-code из глобальной переменной
    const contextCode = (typeof window !== 'undefined' && (window as any).g_context_code) || 'CARL';
    
    // Формируем URL с context-code
    // Проверяем, есть ли уже query параметры в endpoint
    const hasQuery = endpoint.includes('?');
    const separator = hasQuery ? '&' : '?';
    // Используем полный URL для логирования (с хостом и портом)
    const baseForUrl = this.baseUrl || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : '');
    const url = `${baseForUrl}${endpoint}${separator}context-code=${encodeURIComponent(contextCode)}`;
    const method = options.method || 'GET';
    
    // Логирование запроса
    console.log('[ApiClient] Making request:', {
      method,
      url,
      baseUrl: this.baseUrl || '(empty - using relative path)',
      endpoint,
      contextCode,
      hasBody: !!options.body
    });
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    const requestStartTime = Date.now();
    
    try {
      const response = await fetch(url, config);
      const requestDuration = Date.now() - requestStartTime;
      
      // Логирование ответа
      const contentType = response.headers.get('content-type');
      console.log('[ApiClient] Response received:', {
        url,
        status: response.status,
        statusText: response.statusText,
        contentType: contentType || '(not set)',
        ok: response.ok
      });
      
      // Собираем заголовки ответа
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      // Check if response is HTML (indicating Vite dev server fallback)
      if (contentType && contentType.includes('text/html')) {
        console.error('[ApiClient] Got HTML response instead of JSON - server not available or proxy issue');
        const error = new ApiError('Backend server not available', 503, 'SERVER_UNAVAILABLE');
        // Логируем ошибку в UI лог с деталями
        uiLogger.logRequest(method, url, 503, 'Backend server not available', {
          statusText: response.statusText,
          headers: responseHeaders,
          duration: requestDuration
        });
        throw error;
      }

      // Читаем данные ответа (для успешных и ошибочных ответов)
      let responseData: any;
      const isJson = contentType && contentType.includes('application/json');
      
      if (isJson) {
        try {
          responseData = await response.json();
          // Логируем данные ответа для диагностики
          console.log('[ApiClient] Response data:', {
            url,
            dataKeys: responseData && typeof responseData === 'object' && !Array.isArray(responseData) 
              ? Object.keys(responseData) 
              : Array.isArray(responseData) 
                ? `Array[${responseData.length}]` 
                : typeof responseData,
            dataType: typeof responseData,
            isArray: Array.isArray(responseData),
            dataPreview: responseData && typeof responseData === 'object' 
              ? JSON.stringify(responseData).substring(0, 300) 
              : String(responseData).substring(0, 100)
          });
        } catch (e) {
          console.error('[ApiClient] Failed to parse JSON response:', e);
          // Если не удалось прочитать как JSON, пробуем как текст
          try {
            responseData = await response.text();
            console.log('[ApiClient] Response as text:', responseData.substring(0, 200));
          } catch {
            responseData = {};
          }
        }
      } else {
        try {
          responseData = await response.text();
          console.log('[ApiClient] Non-JSON response:', responseData.substring(0, 200));
        } catch {
          responseData = {};
        }
      }
      
      // Подготовка тела запроса для логов (если есть)
      let requestBody: any = undefined;
      if (options.body) {
        try {
          requestBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch {
          requestBody = options.body;
        }
      }
      
      // Логирование ответа в UI лог (успешный или с ошибкой HTTP) с деталями
      uiLogger.logRequest(method, url, response.status, undefined, {
        statusText: response.statusText,
        headers: responseHeaders,
        requestBody: requestBody,
        responseBody: responseData,
        duration: requestDuration
      });

      // Валидация контракта (только в development режиме и для JSON ответов)
      if (this.contractValidationEnabled && isJson) {
        const validation = validateApiResponse(
          options.method || 'GET',
          endpoint,
          response.status,
          responseData
        );

        if (!validation.valid) {
          const errorMessage = `[Contract Validator] Validation failed for ${options.method || 'GET'} ${endpoint}: ${validation.errors.join(', ')}`;
          console.error(errorMessage);
          
          // Отправляем ошибку валидации в backend логи
          this.logToBackend('ERROR', errorMessage).catch(() => {
            // Игнорируем ошибки отправки логов
          });

          // Логируем предупреждения отдельно
          if (validation.warnings.length > 0) {
            const warningMessage = `[Contract Validator] Warnings for ${options.method || 'GET'} ${endpoint}: ${validation.warnings.join(', ')}`;
            console.warn(warningMessage);
            this.logToBackend('WARN', warningMessage).catch(() => {});
          }
        }
      }

      if (!response.ok) {
        // Ошибка HTTP уже залогирована выше через uiLogger.logRequest
        throw new ApiError(
          (responseData && typeof responseData === 'object' && responseData.error) || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          'HTTP_ERROR'
        );
      }

      console.log('[ApiClient] Request successful:', {
        url,
        status: response.status,
        dataType: typeof responseData
      });
      
      return responseData;
    } catch (error) {
      const requestDuration = Date.now() - requestStartTime;
      
      // Детальное логирование ошибок
      if (error instanceof ApiError) {
        console.error('[ApiClient] ApiError:', {
          url,
          message: error.message,
          status: error.status,
          code: error.code
        });
        
        // Логируем только если это не HTTP_ERROR (HTTP ошибки уже залогированы выше при получении response)
        // Логируем SERVER_UNAVAILABLE, DEMO_MODE и другие ошибки без статуса
        if (error.code !== 'HTTP_ERROR') {
          const errorMsg = error.status 
            ? `HTTP ${error.status}: ${error.message}` 
            : error.message;
          
          // Подготовка тела запроса для логов (если есть)
          let requestBody: any = undefined;
          if (options.body) {
            try {
              requestBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
            } catch {
              requestBody = options.body;
            }
          }
          
          uiLogger.logRequest(method, url, error.status, errorMsg, {
            requestBody: requestBody,
            duration: requestDuration
          });
        }
        
        throw error;
      }
      
      // Network errors, CORS errors, etc.
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorType = error instanceof Error ? error.constructor.name : typeof error;
      
      console.error('[ApiClient] Request failed:', {
        url,
        error: errorMessage,
        errorType,
        baseUrl: this.baseUrl || '(empty)',
        endpoint,
        isNetworkError: error instanceof TypeError && error.message.includes('fetch')
      });
      
      // Подготовка тела запроса для логов (если есть)
      let requestBody: any = undefined;
      if (options.body) {
        try {
          requestBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        } catch {
          requestBody = options.body;
        }
      }
      
      // Логирование сетевой ошибки в UI лог с деталями
      uiLogger.logRequest(method, url, undefined, `Network error: ${errorMessage}`, {
        requestBody: requestBody,
        duration: requestDuration,
        errorType: errorType
      });
      
      throw new ApiError(
        `Network error: ${errorMessage}`,
        0,
        'NETWORK_ERROR'
      );
    }
  }

  // GET /api/items - получение всех AiItem
  async getItems(): Promise<AiItem[]> {
    return this.request<AiItem[]>('/api/items');
  }

  // GET /api/items-list - получение списка метаданных AiItem
  async getItemsList(): Promise<AiItemSummary[]> {
    return this.request<AiItemSummary[]>('/api/items-list');
  }

  // GET /api/items/:id - получение конкретного AiItem
  async getItem(id: string): Promise<AiItem> {
    return this.request<AiItem>(`/api/items/${encodeURIComponent(id)}`);
  }

  // GET /api/items/:id/logic-graph - получить сохраненный анализ логики
  async getLogicGraph(itemId: string): Promise<LogicGraphResponse> {
    return this.request<LogicGraphResponse>(`/api/items/${encodeURIComponent(itemId)}/logic-graph`);
  }

  // POST /api/items/:id/logic-graph - сохранить анализ логики
  async saveLogicGraph(itemId: string, analysis: LogicAnalysisResponse): Promise<LogicGraphResponse> {
    return this.request<LogicGraphResponse>(`/api/items/${encodeURIComponent(itemId)}/logic-graph`, {
      method: 'POST',
      body: JSON.stringify(analysis),
    });
  }

  // GET /api/stats - статистика для Dashboard
  async getStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/api/stats');
  }

  // GET /api/graph - данные для Knowledge Graph
  async getGraph(): Promise<GraphData> {
    return this.request<GraphData>('/api/graph');
  }

  // POST /api/chat - RAG чат
  async chat(query: string): Promise<ChatResponse> {
    return this.request<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  // Health check method
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return this.request('/api/health');
  }

  // Run a single pipeline step
  async runPipelineStep(stepId: number, config?: any): Promise<{ success: boolean; step: any }> {
    return this.request<{ success: boolean; step: any }>('/api/pipeline/step/' + stepId + '/run', {
      method: 'POST',
      body: JSON.stringify(config || {}),
    });
  }

  // Get status of all pipeline steps
  async getPipelineStepsStatus(): Promise<{ success: boolean; steps: any[] }> {
    return this.request<{ success: boolean; steps: any[] }>('/api/pipeline/steps/status');
  }

  // Get history of pipeline steps
  async getPipelineStepsHistory(stepId?: number, limit?: number): Promise<import('../types').PipelineStepsHistoryResponse> {
    const params = new URLSearchParams();
    if (stepId !== undefined) {
      params.append('stepId', stepId.toString());
    }
    if (limit !== undefined) {
      params.append('limit', limit.toString());
    }
    
    const queryString = params.toString();
    const endpoint = queryString ? `/api/pipeline/steps/history?${queryString}` : '/api/pipeline/steps/history';
    
    return this.request<import('../types').PipelineStepsHistoryResponse>(endpoint);
  }

  // ─────────────────── v2.1.1 API Methods ───────────────────

  // GET /api/kb-config - получить конфигурацию KB (v2.1.1 совместимый)
  async getKbConfig(): Promise<{ success: boolean; config: KnowledgeBaseConfig }> {
    return this.request<{ success: boolean; config: KnowledgeBaseConfig }>('/api/kb-config');
  }

  // POST /api/kb-config - обновить конфигурацию KB (v2.1.1 совместимый)
  async updateKbConfig(updates: Partial<KnowledgeBaseConfig>): Promise<{ success: boolean; message: string; config: KnowledgeBaseConfig }> {
    return this.request<{ success: boolean; message: string; config: KnowledgeBaseConfig }>('/api/kb-config', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  }

  // GET /api/project/tree - получить дерево файлов проекта (v2.1.1)
  async getProjectTree(rootPath: string, depth?: number): Promise<ProjectFile[]> {
    const params = new URLSearchParams({ rootPath });
    if (depth !== undefined) {
      params.append('depth', depth.toString());
    }
    
    return this.request<ProjectFile[]>(`/api/project/tree?${params.toString()}`);
  }

  // POST /api/project/selection - сохранить точную выборку файлов (v2.1.1)
  async saveFileSelection(request: FileSelectionRequest): Promise<{ success: boolean; message: string; config: KnowledgeBaseConfig }> {
    return this.request<{ success: boolean; message: string; config: KnowledgeBaseConfig }>('/api/project/selection', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // DELETE /api/vector-db - очистить векторную базу данных
  async clearVectorDatabase(): Promise<{ success: boolean; message: string; deletedFiles?: string[]; errors?: string[] }> {
    return this.request<{ success: boolean; message: string; deletedFiles?: string[]; errors?: string[] }>('/api/vector-db', {
      method: 'DELETE',
    });
  }

  // Switch to demo mode
  setDemoMode(enabled: boolean) {
    this.isDemoMode = enabled;
  }

  getDemoMode(): boolean {
    return this.isDemoMode;
  }

  /**
   * Отправляет лог на backend через POST /api/logs
   * Использует относительный путь, который проксируется через Vite на внешний сервер
   */
  private async logToBackend(level: 'INFO' | 'WARN' | 'ERROR', message: string): Promise<void> {
    try {
      // Используем относительный путь, который будет проксироваться через Vite на внешний сервер
      const logUrl = this.baseUrl ? `${this.baseUrl}/api/logs` : '/api/logs';
      
      console.log(`[ApiClient] Sending log to backend: ${level}`, {
        url: logUrl,
        message: message.substring(0, 100)
      });
      
      const response = await fetch(logUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ level, message }),
      });
      
      if (!response.ok) {
        console.warn(`[ApiClient] Failed to send log to backend: ${response.status} ${response.statusText}`);
      } else {
        console.log(`[ApiClient] Log sent successfully to backend: ${level}`);
      }
    } catch (error) {
      // Логируем ошибку, но не прерываем основной поток
      console.warn('[ApiClient] Error sending log to backend:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Включает/выключает валидацию контракта
   */
  setContractValidation(enabled: boolean) {
    this.contractValidationEnabled = enabled;
  }
}

// Create default API client instance
export const apiClient = new ApiClient();

// Export convenience functions that handle demo mode fallback
export const getItemsWithFallback = async (): Promise<{ data: AiItem[]; isDemo: boolean }> => {
  try {
    const data = await apiClient.getItems();
    return { data, isDemo: false };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      console.warn('[ApiClient] getItemsWithFallback: API unavailable, using demo data. Error:', error.message);
      return { data: MOCK_AI_ITEMS, isDemo: true };
    }
    throw error; // Re-throw other errors (like authentication issues)
  }
};

export const getItemsListWithFallback = async (): Promise<{ data: AiItemSummary[]; isDemo: boolean }> => {
  try {
    const data = await apiClient.getItemsList();
    return { data, isDemo: false };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      console.warn('[ApiClient] getItemsListWithFallback: API unavailable, using demo data');
      const demoList = MOCK_AI_ITEMS.map(item => ({
        id: item.id,
        type: item.type,
        language: item.language,
        filePath: item.filePath
      }));
      return { data: demoList, isDemo: true };
    }
    throw error;
  }
};

export const getStatsWithFallback = async (): Promise<{ data: DashboardStats; isDemo: boolean }> => {
  try {
    const data = await apiClient.getStats();
    // Гарантируем, что languageStats и typeStats всегда массивы
    return { 
      data: {
        ...data,
        languageStats: data.languageStats || [],
        typeStats: data.typeStats || []
      }, 
      isDemo: false 
    };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      console.warn('[ApiClient] getStatsWithFallback: API unavailable, using demo data. Error:', error.message);
      // Generate mock stats
      const mockStats: DashboardStats = {
        totalItems: MOCK_AI_ITEMS.length,
        totalDeps: MOCK_AI_ITEMS.reduce((acc, item) => acc + item.l1_deps.length, 0),
        averageDependencyDensity: '2.1',
        typeStats: [
          { name: 'Function', count: MOCK_AI_ITEMS.filter(i => i.type === 'function').length },
          { name: 'Class', count: MOCK_AI_ITEMS.filter(i => i.type === 'class').length },
          { name: 'Interface', count: MOCK_AI_ITEMS.filter(i => i.type === 'interface').length },
          { name: 'Struct', count: MOCK_AI_ITEMS.filter(i => i.type === 'struct').length },
        ],
        languageStats: Object.entries(MOCK_AI_ITEMS.reduce((acc, item) => {
          acc[item.language] = (acc[item.language] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)).map(([name, value]) => ({ name, value })),
        vectorIndexSize: '5.1 MB',
        lastScan: new Date().toISOString()
      };
      return { data: mockStats, isDemo: true };
    }
    throw error;
  }
};

export const getGraphWithFallback = async (): Promise<{ data: GraphData; isDemo: boolean }> => {
  try {
    const data = await apiClient.getGraph();
    return { data, isDemo: false };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      console.warn('[ApiClient] getGraphWithFallback: API unavailable, using demo data. Error:', error.message);
      // Generate mock graph data
      const nodes = MOCK_AI_ITEMS.map(item => ({
        id: item.id,
        type: item.type,
        language: item.language,
        filePath: item.filePath,
        l2_desc: item.l2_desc
      }));
      
      const links: Array<{ source: string; target: string }> = [];
      MOCK_AI_ITEMS.forEach(source => {
        source.l1_deps.forEach(targetId => {
          const target = MOCK_AI_ITEMS.find(t => t.id === targetId);
          if (target) {
            links.push({ source: source.id, target: target.id });
          }
        });
      });
      
      return { data: { nodes, links }, isDemo: true };
    }
    throw error;
  }
};

// ─────────────────── v2.1.1 Convenience Functions ───────────────────

export const getProjectTreeWithFallback = async (rootPath: string, depth?: number): Promise<{ data: ProjectFile[]; isDemo: boolean }> => {
  try {
    const data = await apiClient.getProjectTree(rootPath, depth);
    return { data, isDemo: false };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      console.warn('[ApiClient] getProjectTreeWithFallback: API unavailable, returning empty tree');
      // Возвращаем пустой массив вместо fallback на deprecated endpoint
      return { data: [], isDemo: true };
    }
    throw error;
  }
};

export const getKbConfigWithFallback = async (): Promise<{ data: KnowledgeBaseConfig; isDemo: boolean }> => {
  try {
    const result = await apiClient.getKbConfig();
    return { data: result.config, isDemo: false };
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'SERVER_UNAVAILABLE' || error.code === 'NETWORK_ERROR')) {
      console.warn('[ApiClient] getKbConfigWithFallback: API unavailable, using demo data');
      
      // Возвращаем демо-конфигурацию v2.1.1
      const demoConfig: KnowledgeBaseConfig = {
        targetPath: './',
        includeMask: '**/*.{py,js,ts,tsx,go,java}',
        ignorePatterns: '**/node_modules/**,**/venv/**,**/__pycache__/**',
        rootPath: '/demo/project',
        fileSelection: [],
        metadata: {
          projectName: 'Demo Project',
          description: 'Demo configuration for offline mode',
          version: '2.1.1'
        },
        lastUpdated: new Date().toISOString()
      };
      
      return { data: demoConfig, isDemo: true };
    }
    throw error;
  }
};
