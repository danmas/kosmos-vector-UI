import { AiItem, AiItemSummary, ChatMessage, ProjectFile, KnowledgeBaseConfig, FileSelectionRequest, LogicAnalysisResponse, LogicGraphResponse, AiCommentResponse, BulkTagsResponse, RAGRetrieveRequest, RAGRetrieveResponse, RAGAskRequest, RAGAskResponse, CompareStrategiesRequest, CompareStrategiesResponse, StrategiesResponse } from '../types';
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
    public code?: string,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Расширенные опции запроса с поддержкой contextCode
interface ExtendedRequestInit extends RequestInit {
  contextCode?: string;
}

export class ApiClient {
  private baseUrl: string;
  private isDemoMode: boolean;
  private contractValidationEnabled: boolean;

  constructor(baseUrl: string = '', demoMode: boolean = false) {
    this.baseUrl = baseUrl;
    this.isDemoMode = demoMode;
    // Валидация контракта включена по умолчанию в development режиме
    this.contractValidationEnabled = (import.meta as any).env?.DEV;
  }

  private async request<T>(
    endpoint: string,
    options: ExtendedRequestInit = {}
  ): Promise<T> {
    // If demo mode is explicitly enabled, throw error to indicate no API available
    if (this.isDemoMode) {
      throw new ApiError('Demo mode is active - API not available', 503, 'DEMO_MODE');
    }

    // Получаем context-code из опций или глобальной переменной
    const contextCode = options.contextCode || (typeof window !== 'undefined' && (window as any).g_context_code) || 'CARL';

    // Формируем URL с context-code
    // Проверяем, есть ли уже query параметры в endpoint
    const hasQuery = endpoint.includes('?');
    // Проверяем, не добавлен ли уже context-code в endpoint
    const hasContextCode = endpoint.includes('context-code=');
    const separator = hasQuery ? '&' : '?';
    // Используем полный URL для логирования (с хостом и портом)
    const baseForUrl = this.baseUrl || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : '');
    // Добавляем context-code только если его еще нет в endpoint
    const url = hasContextCode
      ? `${baseForUrl}${endpoint}`
      : `${baseForUrl}${endpoint}${separator}context-code=${encodeURIComponent(contextCode)}`;
    const method = options.method || 'GET';

    // console.log('[ApiClient] Making request:', { method, url, ... }); // Отключено

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

      const contentType = response.headers.get('content-type');
      // console.log('[ApiClient] Response received:', { url, status, ... }); // Отключено

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
          // console.log('[ApiClient] Response data:', ...); // Отключено
        } catch (e) {
          console.error('[ApiClient] Failed to parse JSON response:', e);
          // Если не удалось прочитать как JSON, пробуем как текст
          try {
            responseData = await response.text();
            // console.log('[ApiClient] Response as text:', ...); // Отключено
          } catch {
            responseData = {};
          }
        }
      } else {
        try {
          responseData = await response.text();
          // console.log('[ApiClient] Non-JSON response:', ...); // Отключено
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
            this.logToBackend('WARN', warningMessage).catch(() => { });
          }
        }
      }

      if (!response.ok) {
        // Ошибка HTTP уже залогирована выше через uiLogger.logRequest
        throw new ApiError(
          (responseData && typeof responseData === 'object' && responseData.error) || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          'HTTP_ERROR',
          responseData
        );
      }

      // console.log('[ApiClient] Request successful:', { url, status, ... }); // Отключено

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
  async getItemsList(contextCode?: string): Promise<AiItemSummary[]> {
    return this.request<AiItemSummary[]>('/api/items-list', { contextCode });
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

  // POST /api/items/:id/analyze-logic - анализ логики через серверный LLM
  async analyzeLogicViaServer(itemId: string): Promise<LogicAnalysisResponse> {
    return this.request<LogicAnalysisResponse>(`/api/items/${encodeURIComponent(itemId)}/analyze-logic`, {
      method: 'POST',
    });
  }

  // GET /api/items/:id/comment - получить комментарий для AiItem
  async getComment(itemId: string): Promise<AiCommentResponse> {
    return this.request<AiCommentResponse>(`/api/items/${encodeURIComponent(itemId)}/comment`);
  }

  // POST /api/items/:id/comment - создать или обновить комментарий (UPSERT)
  async saveComment(itemId: string, comment: string): Promise<AiCommentResponse> {
    return this.request<AiCommentResponse>(`/api/items/${encodeURIComponent(itemId)}/comment`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  }

  // DELETE /api/items/:id/comment - удалить комментарий
  async deleteComment(itemId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/api/items/${encodeURIComponent(itemId)}/comment`, {
      method: 'DELETE',
    });
  }

  // POST /api/items/:id/extract-columns - извлечение колонок таблиц из SQL-функции
  async extractColumns(itemId: string): Promise<import('../types').ColumnExtractionResponse> {
    return this.request<import('../types').ColumnExtractionResponse>(
      `/api/items/${encodeURIComponent(itemId)}/extract-columns`,
      { method: 'POST' }
    );
  }

  // POST /api/items/:id/rebuild-sql-links - пересборка L1-связей из клиентской БД
  async rebuildSqlLinks(itemId: string): Promise<any> {
    return this.request<any>(
      `/api/items/${encodeURIComponent(itemId)}/rebuild-sql-links`,
      { method: 'POST' }
    );
  }

  // GET /api/stats - статистика для Dashboard
  async getStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/api/stats');
  }

  // GET /api/graph - данные для Knowledge Graph
  async getGraph(contextCode?: string): Promise<GraphData> {
    return this.request<GraphData>('/api/graph', { contextCode });
  }

  // POST /api/chat - RAG чат
  async chat(message: string): Promise<ChatResponse> {
    return this.request<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  // POST /api/ask - Прямой запрос к LLM (без RAG)
  async ask(request: import('../types').AskRequest): Promise<import('../types').AskResponse> {
    return this.request<import('../types').AskResponse>('/api/ask', {
      method: 'POST',
      body: JSON.stringify(request),
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

  // POST /vectorize-ai-items - векторизация ai_item по fullNames
  async vectorizeAiItems(params: {
    fullNames: string[];
    force: boolean;
    contextCode?: string;
  }): Promise<import('../types').VectorizeAiItemsResponse> {
    return this.request<import('../types').VectorizeAiItemsResponse>('/vectorize-ai-items', {
      method: 'POST',
      body: JSON.stringify({
        fullNames: params.fullNames,
        force: params.force,
      }),
      contextCode: params.contextCode,
    });
  }

  // GET /api/pipeline/context-definition - получить определения шагов
  async getPipelineContextDefinition(): Promise<{ steps: import('../types').PipelineStepDefinition[] }> {
    return this.request<{ steps: import('../types').PipelineStepDefinition[] }>('/api/pipeline/context-definition');
  }

  // GET /api/pipeline/context-config - получить конфигурацию шагов
  async getPipelineContextConfig(): Promise<any> {
    return this.request<any>('/api/pipeline/context-config');
  }

  // POST /api/pipeline/context-config - обновить конфигурацию шагов
  async updatePipelineContextConfig(config: any): Promise<{ success: boolean; config: any }> {
    return this.request<{ success: boolean; config: any }>('/api/pipeline/context-config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // GET /api/contexts - получить список доступных context codes
  async getAvailableContexts(): Promise<{ success: boolean; contexts: string[] }> {
    return this.request<{ success: boolean; contexts: string[] }>('/api/contexts');
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

      // console.log(`[ApiClient] Sending log to backend: ${level}`, ...); // Отключено

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
        // console.log(`[ApiClient] Log sent successfully to backend: ${level}`); // Отключено
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

  // ─────────────────── Natural Query & Agent Scripts API ───────────────────

  /**
   * POST /api/v1/natural-query - основной эндпоинт для запросов на естественном языке
   */
  async naturalQuery(question: string): Promise<import('../types').NaturalQueryResponse> {
    const contextCode = (typeof window !== 'undefined' && (window as any).g_context_code) || 'CARL';
    return this.request<import('../types').NaturalQueryResponse>('/api/v1/natural-query', {
      method: 'POST',
      body: JSON.stringify({
        question,
        contextCode
      }),
    });
  }

  /**
   * POST /api/v1/natural-query/suggest - поиск похожих вопросов
   */
  async suggestSimilarQuestions(
    question: string,
    limit: number = 5,
    threshold: number = 0.8
  ): Promise<import('../types').SuggestResponse> {
    const contextCode = (typeof window !== 'undefined' && (window as any).g_context_code) || 'CARL';
    const params = new URLSearchParams({
      limit: limit.toString(),
      threshold: threshold.toString()
    });
    return this.request<import('../types').SuggestResponse>(`/api/v1/natural-query/suggest?${params.toString()}`, {
      method: 'POST',
      body: JSON.stringify({
        question,
        contextCode
      }),
    });
  }

  /**
   * GET /api/agent-scripts - список всех скриптов (с пагинацией)
   */
  async getAgentScripts(page: number = 1, limit: number = 50): Promise<import('../types').AgentScriptsResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });
    return this.request<import('../types').AgentScriptsResponse>(`/api/agent-scripts?${params.toString()}`);
  }

  /**
   * GET /api/agent-scripts/{id} - детали скрипта
   */
  async getAgentScript(id: number): Promise<import('../types').AgentScriptDetailResponse> {
    return this.request<import('../types').AgentScriptDetailResponse>(`/api/agent-scripts/${id}`);
  }

  /**
   * PUT /api/agent-scripts/{id} - обновление скрипта (код и/или is_valid)
   */
  async updateAgentScript(id: number, updates: { script?: string; is_valid?: boolean }): Promise<import('../types').AgentScriptDetailResponse> {
    return this.request<import('../types').AgentScriptDetailResponse>(`/api/agent-scripts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * DELETE /api/agent-scripts/{id} - удаление скрипта
   */
  async deleteAgentScript(id: number): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/api/agent-scripts/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * POST /api/agent-scripts/{id}/execute - выполнение существующего скрипта
   */
  async executeAgentScript(id: number): Promise<import('../types').NaturalQueryResponse> {
    return this.request<import('../types').NaturalQueryResponse>(`/api/agent-scripts/${id}/execute`, {
      method: 'POST',
    });


  }

  // ─────────────────── Prompts API (v2.4.0) ───────────────────

  /**
   * GET /api/prompts - получить все промпты
   */
  async getPrompts(): Promise<import('../types').PromptsConfigResponse> {
    return this.request<import('../types').PromptsConfigResponse>('/api/prompts');
  }

  /**
   * PUT /api/prompts - обновить все промпты
   */
  async updatePrompts(prompts: import('../types').PromptsConfig): Promise<import('../types').PromptsConfigResponse> {
    return this.request<import('../types').PromptsConfigResponse>('/api/prompts', {
      method: 'PUT',
      body: JSON.stringify(prompts),
    });
  }

  /**
   * GET /api/prompts/{category} - получить промпты категории
   */
  async getPromptsCategory(category: 'naturalQuery' | 'rag' | 'vectorOperations' | 'l1l2Templates'): Promise<import('../types').PromptCategoryResponse> {
    return this.request<import('../types').PromptCategoryResponse>(`/api/prompts/${category}`);
  }

  /**
   * PATCH /api/prompts/{category} - частично обновить промпты категории
   */
  async patchPromptsCategory(
    category: 'naturalQuery' | 'rag' | 'vectorOperations' | 'l1l2Templates',
    data: Partial<import('../types').NaturalQueryPrompts | import('../types').RagPrompts | import('../types').VectorOperationsPrompts>
  ): Promise<import('../types').PromptCategoryResponse> {
    return this.request<import('../types').PromptCategoryResponse>(`/api/prompts/${category}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * POST /api/prompts/reload - перезагрузить из файла
   */
  async reloadPrompts(): Promise<import('../types').PromptsConfigResponse> {
    return this.request<import('../types').PromptsConfigResponse>('/api/prompts/reload', {
      method: 'POST',
    });
  }

  /**
   * POST /api/prompts/validate - валидировать без сохранения
   */
  async validatePrompts(prompts: import('../types').PromptsConfig): Promise<{ success: boolean; valid: boolean; errors?: Array<{ path: string; message: string }> }> {
    return this.request<{ success: boolean; valid: boolean; errors?: Array<{ path: string; message: string }> }>('/api/prompts/validate', {
      method: 'POST',
      body: JSON.stringify(prompts),
    });




  }

  /**
   * GET /api/prompts/export - экспорт промптов
   */
  async exportPrompts(format: 'json' | 'yaml' = 'json'): Promise<import('../types').PromptsConfig | string> {
    return this.request<import('../types').PromptsConfig | string>(`/api/prompts/export?format=${format}`);
  }

  /**
   * POST /api/prompts/import - импорт промптов
   */
  async importPrompts(prompts: import('../types').PromptsConfig): Promise<import('../types').PromptsConfigResponse> {
    return this.request<import('../types').PromptsConfigResponse>('/api/prompts/import', {
      method: 'POST',
      body: JSON.stringify(prompts),
    });
  }

  // ─────────────────── Tags API ───────────────────

  /**
   * GET /api/tags - получить все теги
   */
  async getTags(): Promise<import('../types').TagsListResponse> {
    return this.request<import('../types').TagsListResponse>('/api/tags');
  }

  /**
   * POST /api/tags - создать новый тег
   */
  async createTag(data: { code: string; name: string; description?: string }): Promise<import('../types').TagResponse> {
    return this.request<import('../types').TagResponse>('/api/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * GET /api/items/{id}/tags - получить теги AI Item
   */
  async getItemTags(itemId: string): Promise<import('../types').ItemTagsResponse> {
    return this.request<import('../types').ItemTagsResponse>(`/api/items/${encodeURIComponent(itemId)}/tags`);
  }

  /**
   * PUT /api/items/{id}/tags - синхронизировать теги AI Item (заменить все)
   */
  async syncItemTags(itemId: string, tagCodes: string[]): Promise<import('../types').ItemTagsResponse> {
    return this.request<import('../types').ItemTagsResponse>(`/api/items/${encodeURIComponent(itemId)}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tagCodes }),
    });
  }

  // Массовое добавление тегов к элементам
  async addTagsToItems(itemIds: string[], tagCodes: string[]): Promise<BulkTagsResponse> {
    const response = await this.request('/api/ai-items/bulk/tags/add', {
      method: 'POST',
      body: JSON.stringify({ itemIds, tagCodes })
    });
    return response as BulkTagsResponse;
  }

  // Массовое удаление тегов у элементов  
  async removeTagsFromItems(itemIds: string[], tagCodes: string[]): Promise<BulkTagsResponse> {
    const response = await this.request('/api/ai-items/bulk/tags/remove', {
      method: 'POST',
      body: JSON.stringify({ itemIds, tagCodes })
    });
    return response as BulkTagsResponse;
  }

  // ─────────────────── Item Types API (v2.10.0) ───────────────────

  /**
   * GET /api/types - получить все типы
   */
  async getItemTypes(): Promise<import('../types').ItemTypeListResponse> {
    return this.request<import('../types').ItemTypeListResponse>('/api/types');
  }

  /**
   * GET /api/types/{code} - получить тип по коду
   */
  async getItemType(code: string): Promise<import('../types').ItemTypeResponse> {
    return this.request<import('../types').ItemTypeResponse>(
      `/api/types/${encodeURIComponent(code)}`
    );
  }

  /**
   * GET /api/types/{code}/items - получить AI Items с указанным типом
   */
  async getItemsByType(code: string): Promise<import('../types').ItemTypeItemsResponse> {
    return this.request<import('../types').ItemTypeItemsResponse>(
      `/api/types/${encodeURIComponent(code)}/items`
    );
  }

  /**
   * POST /api/types - создать новый кастомный тип
   */
  async createItemType(data: import('../types').ItemTypeCreateRequest): Promise<import('../types').ItemTypeResponse> {
    return this.request<import('../types').ItemTypeResponse>('/api/types', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PUT /api/types/{code} - обновить тип
   */
  async updateItemType(
    code: string,
    data: import('../types').ItemTypeUpdateRequest
  ): Promise<import('../types').ItemTypeResponse> {
    return this.request<import('../types').ItemTypeResponse>(
      `/api/types/${encodeURIComponent(code)}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * DELETE /api/types/{code} - удалить кастомный тип
   */
  async deleteItemType(code: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/api/types/${encodeURIComponent(code)}`,
      {
        method: 'DELETE',
      }
    );
  }

  // ─────────────────── RAG API (v2.7.0) ───────────────────

  /**
   * POST /api/rag/retrieve - Получение структурированного контекста без LLM
   */
  async ragRetrieve(request: RAGRetrieveRequest): Promise<RAGRetrieveResponse> {
    return this.request<RAGRetrieveResponse>('/api/rag/retrieve', {
      method: 'POST',
      body: JSON.stringify(request),
      contextCode: request.contextCode,
    });
  }

  /**
   * POST /api/rag/ask - Полный RAG цикл с генерацией ответа LLM
   */
  async ragAsk(request: RAGAskRequest): Promise<RAGAskResponse> {
    return this.request<RAGAskResponse>('/api/rag/ask', {
      method: 'POST',
      body: JSON.stringify(request),
      contextCode: request.contextCode,
    });
  }

  /**
   * POST /api/rag/compare-strategies - Сравнение эффективности стратегий
   */
  async ragCompareStrategies(request: CompareStrategiesRequest): Promise<CompareStrategiesResponse> {
    return this.request<CompareStrategiesResponse>('/api/rag/compare-strategies', {
      method: 'POST',
      body: JSON.stringify(request),
      contextCode: request.contextCode,
    });
  }

  /**
   * GET /api/rag/strategies - Список доступных стратегий
   */
  async ragGetStrategies(): Promise<StrategiesResponse> {
    return this.request<StrategiesResponse>('/api/rag/strategies');
  }

  // ─────────────────── App Config API (v2.8.0) ───────────────────

  /**
   * GET /api/config - Получить текущую конфигурацию приложения
   */
  async getAppConfig(): Promise<import('../types').AppConfigResponse> {
    return this.request<import('../types').AppConfigResponse>('/api/config');
  }

  /**
   * PATCH /api/config - Частично обновить конфигурацию
   */
  async updateAppConfig(updates: import('../types').AppConfigUpdateRequest): Promise<import('../types').AppConfigUpdateResponse> {
    return this.request<import('../types').AppConfigUpdateResponse>('/api/config', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /**
   * POST /api/config/reset - Сбросить конфигурацию к значениям по умолчанию
   */
  async resetAppConfig(): Promise<import('../types').AppConfigUpdateResponse> {
    return this.request<import('../types').AppConfigUpdateResponse>('/api/config/reset', {
      method: 'POST',
    });
  }

  // ─────────────────── Prompts Config API (v2.9.0) ───────────────────

  /**
   * GET /api/prompts-config - Получить текущую конфигурацию промптов
   */
  async getPromptsConfig(): Promise<import('../types').PromptsConfigResponse> {
    return this.request<import('../types').PromptsConfigResponse>('/api/prompts-config');
  }

  /**
   * PATCH /api/prompts-config - Обновить конфигурацию промптов
   */
  async updatePromptsConfig(
    updates: Partial<import('../types').PromptsConfig>,
    comment?: string
  ): Promise<import('../types').PromptsConfigUpdateResponse> {
    return this.request<import('../types').PromptsConfigUpdateResponse>('/api/prompts-config', {
      method: 'PATCH',
      body: JSON.stringify({ updates, comment }),
    });
  }

  /**
   * GET /api/prompts-config/history - Получить историю изменений промптов
   */
  async getPromptsConfigHistory(
    limit: number = 50,
    offset: number = 0
  ): Promise<import('../types').PromptsConfigHistoryResponse> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    });
    return this.request<import('../types').PromptsConfigHistoryResponse>(
      `/api/prompts-config/history?${params.toString()}`
    );
  }

  /**
   * GET /api/prompts-config/history/:id - Получить конкретную версию из истории
   */
  async getPromptsConfigHistoryEntry(
    id: number
  ): Promise<import('../types').PromptsConfigHistoryEntryResponse> {
    return this.request<import('../types').PromptsConfigHistoryEntryResponse>(
      `/api/prompts-config/history/${id}`
    );
  }

  /**
   * POST /api/prompts-config/restore/:id - Восстановить конфигурацию из истории
   */
  async restorePromptsConfig(
    id: number,
    comment?: string
  ): Promise<import('../types').PromptsConfigUpdateResponse> {
    return this.request<import('../types').PromptsConfigUpdateResponse>(
      `/api/prompts-config/restore/${id}`,
      {
        method: 'POST',
        body: JSON.stringify({ comment }),
      }
    );
  }

  /**
   * POST /api/prompts-config/reset - Сбросить конфигурацию к дефолтным значениям
   */
  async resetPromptsConfig(
    comment?: string
  ): Promise<import('../types').PromptsConfigUpdateResponse> {
    return this.request<import('../types').PromptsConfigUpdateResponse>(
      '/api/prompts-config/reset',
      {
        method: 'POST',
        body: JSON.stringify({ comment }),
      }
    );
  }

  /**
   * DELETE /api/prompts-config/history/:id - Удалить запись из истории
   */
  async deletePromptsConfigHistoryEntry(
    id: number
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/api/prompts-config/history/${id}`,
      {
        method: 'DELETE',
      }
    );
  }

  // ─────────────────── Graph Snapshots API ───────────────────

  /**
   * GET /api/graph-snapshots - Получить список всех снимков графа
   */
  async getGraphSnapshots(): Promise<import('../types').GraphSnapshotListResponse> {
    return this.request<import('../types').GraphSnapshotListResponse>('/api/graph-snapshots');
  }

  /**
   * POST /api/graph-snapshots - Создать новый снимок графа
   */
  async createGraphSnapshot(
    data: import('../types').GraphSnapshotCreateRequest
  ): Promise<import('../types').GraphSnapshotResponse> {
    return this.request<import('../types').GraphSnapshotResponse>('/api/graph-snapshots', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * GET /api/graph-snapshots/:id - Получить снимок по ID
   */
  async getGraphSnapshot(snapshotId: string): Promise<import('../types').GraphSnapshotResponse> {
    return this.request<import('../types').GraphSnapshotResponse>(
      `/api/graph-snapshots/${encodeURIComponent(snapshotId)}`
    );
  }

  /**
   * PATCH /api/graph-snapshots/:id - Обновить снимок (название)
   */
  async updateGraphSnapshot(
    snapshotId: string,
    data: import('../types').GraphSnapshotUpdateRequest
  ): Promise<import('../types').GraphSnapshotResponse> {
    return this.request<import('../types').GraphSnapshotResponse>(
      `/api/graph-snapshots/${encodeURIComponent(snapshotId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * DELETE /api/graph-snapshots/:id - Удалить снимок
   */
  async deleteGraphSnapshot(snapshotId: string): Promise<import('../types').GraphSnapshotDeleteResponse> {
    return this.request<import('../types').GraphSnapshotDeleteResponse>(
      `/api/graph-snapshots/${encodeURIComponent(snapshotId)}`,
      {
        method: 'DELETE',
      }
    );
  }

  /**
   * GET /api/graph-snapshots/export - Экспорт всех снимков
   */
  async exportGraphSnapshots(): Promise<import('../types').GraphSnapshotsExportResponse> {
    return this.request<import('../types').GraphSnapshotsExportResponse>('/api/graph-snapshots/export');
  }

  /**
   * POST /api/graph-snapshots/import - Импорт снимков
   */
  async importGraphSnapshots(
    data: import('../types').GraphSnapshotsImportRequest
  ): Promise<import('../types').GraphSnapshotsImportResponse> {
    return this.request<import('../types').GraphSnapshotsImportResponse>('/api/graph-snapshots/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

}

// Create default API client instance (uses VITE_BACKEND_PORT from .env when set)
const backendPort = (import.meta as any).env?.VITE_BACKEND_PORT;
const defaultBaseUrl = backendPort ? `http://localhost:${backendPort}` : '';
export const apiClient = new ApiClient(defaultBaseUrl);

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

export const getItemsListWithFallback = async (contextCode?: string): Promise<{ data: AiItemSummary[]; isDemo: boolean }> => {
  try {
    const data = await apiClient.getItemsList(contextCode);
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
        totalDeps: MOCK_AI_ITEMS.reduce((acc, item) => acc + (item.l1_out?.length || 0), 0),
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

export const getGraphWithFallback = async (contextCode?: string): Promise<{ data: GraphData; isDemo: boolean }> => {
  try {
    const data = await apiClient.getGraph(contextCode);
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

      const links: Array<{ source: string; target: string; label?: string }> = [];
      MOCK_AI_ITEMS.forEach(source => {
        (source.l1_out || []).forEach(link => {
          // Поддержка нового формата (объект с target и type) и старого (строка)
          const targetId = typeof link === 'string' ? link : link.target;
          const linkType = typeof link === 'string' ? undefined : link.type;
          const target = MOCK_AI_ITEMS.find(t => t.id === targetId);
          if (target) {
            links.push({ source: source.id, target: target.id, label: linkType });
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
