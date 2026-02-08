export enum AppView {
  DASHBOARD = 'DASHBOARD',
  FILES = 'FILES',
  PIPELINE = 'PIPELINE',
  INSPECTOR = 'INSPECTOR', // New view for deep dive
  GRAPH = 'GRAPH',
  CHAT = 'CHAT',
  LOGS = 'LOGS'
}

export enum AiItemType {
  FUNCTION = 'function',
  CLASS = 'class',
  METHOD = 'method',
  MODULE = 'module',
  INTERFACE = 'interface', // For TS/Java
  STRUCT = 'struct',       // For Go
  TABLE = 'table',         // SQL tables
  TABLE_COLUMN = 'table_column' // SQL table columns
}

// ────────────────────────────────────── L1 Link Types

/** Типы связей L1 */
export type L1LinkType = 
  | 'calls'           // Вызов функции
  | 'reads_from'      // Чтение из таблицы (SELECT)
  | 'updates'         // Обновление таблицы (UPDATE)
  | 'inserts_into'    // Вставка в таблицу (INSERT)
  | 'reads_column'    // Чтение колонки
  | 'updates_column'  // Обновление колонки
  | 'inserts_column'  // Вставка в колонку
  | 'imports'         // Импорт модуля
  | 'depends_on';     // Общая зависимость (fallback)

/** Входящая связь L1: кто вызывает/использует этот элемент */
export interface L1LinkIn {
  source: string;
  type: L1LinkType;
}

/** Исходящая связь L1: что вызывает/использует этот элемент */
export interface L1Link {
  target: string;
  type: L1LinkType;
}

export interface AiItem {
  id: string;
  type: AiItemType;
  language: Language;
  l0_code: string;
  l1_in: L1LinkIn[];   // Входящие: кто вызывает этот элемент (с типом связи)
  l1_out: L1Link[];    // Исходящие: что вызывает этот элемент (с типом связи)
  l2_desc: string;
  filePath: string;
  isVectorized?: boolean;
}

export interface AiItemSummary {
  id: string;
  type: AiItemType;
  language: Language;
  filePath: string;
  tags?: TagSummary[]; // Теги элемента (опционально)
  isVectorized?: boolean;
}

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  checked?: boolean;
  error?: boolean;
  errorMessage?: string;
}

// ────────────────────────────────────── v2.1.2 Types

// Гибкое поле language без жёсткого enum (версия 2.1.2)
// Может быть любая строка (например: python, javascript, typescript, java, go, sql, markdown, csharp, rust, unknown и т.д.)
export type Language = string | null;

export interface ProjectFile {
  path: string; // Относительный путь от корня проекта (всегда с ./)
  name: string;
  type: 'file' | 'directory';
  size: number;
  selected: boolean;
  children?: ProjectFile[];
  language?: Language;
  error?: boolean;
  errorMessage?: string;
}

export interface KnowledgeBaseConfig {
  // Обратная совместимость (legacy)
  targetPath: string;
  includeMask: string;
  ignorePatterns: string;

  // Новые обязательные поля v2.1.1
  rootPath: string; // Абсолютный путь к проекту на стороне бэкенда
  fileSelection: string[]; // Точный список выбранных относительных путей

  // Опциональные поля
  metadata?: {
    projectName?: string;
    description?: string;
    version?: string;
    tags?: string[];
    [key: string]: any;
  };

  lastUpdated: string;
}

export interface FileSelectionRequest {
  rootPath: string; // Абсолютный путь к проекту на сервере
  files: string[]; // Массив относительных путей (начинающихся с ./)
}

export interface PipelineStep {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  details?: string;
  report?: object | null;
}

export interface PipelineStepHistoryEntry {
  timestamp: string; // ISO date-time
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number | null; // 0-100
  itemsProcessed: number | null;
  totalItems: number | null;
  error: string | null;
  report: object | null;
}

export interface PipelineStepHistory {
  stepId: number;
  stepName: string;
  history: PipelineStepHistoryEntry[];
}

export interface PipelineStepsHistoryResponse {
  success: true;
  steps: PipelineStepHistory[];
}

export interface PipelineStepDefinition {
  id: number;
  name: string;
  label: string;
  description: string;
  configurationSchema?: object;
}

export interface PipelineContextDefinition {
  steps: PipelineStepDefinition[];
}

export interface PipelineContextConfig {
  [stepName: string]: {
    [key: string]: any;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  retrievedContext?: AiItem[]; // Simulation of RAG context
  timestamp: number;
}

export interface ServerLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'ERROR' | 'WARN';
  message: string;
  source?: 'UI' | 'SERVER'; // Источник лога: UI (запросы из фронтенда) или SERVER (логи бэкенда)
  details?: {
    method?: string;
    url?: string;
    status?: number;
    statusText?: string;
    error?: string;
    headers?: Record<string, string>;
    requestBody?: any;
    responseBody?: any;
    duration?: number;
    [key: string]: any; // Для дополнительных полей
  };
}

// ────────────────────────────────────── Logic Architect Types

export type LogicNodeType = 'start' | 'end' | 'decision' | 'process' | 'db_call' | 'exception';

export interface LogicNode {
  id: string;
  type: LogicNodeType;
  label: string;
  details?: string;
  x?: number;
  y?: number;
}

export interface LogicEdge {
  id: string;
  from: string;
  to: string;
  label?: string; // e.g., "True" / "False"
}

export interface LogicGraph {
  nodes: LogicNode[];
  edges: LogicEdge[];
}

export interface LogicAnalysisResponse {
  logic: string;
  graph: LogicGraph;
}

export interface LogicGraphResponse {
  success: boolean;
  itemId: string;
  logicGraph: LogicAnalysisResponse;
  savedAt: string;
  updatedAt?: string | null;
}

export interface FunctionMetadata {
  body: string;
  s_name?: string;
  full_name?: string;
  signature?: string;
  comment?: string;
  select_from?: string[];
  insert_tables?: string[];
  update_tables?: string[];
  called_functions?: string[];
}

// ────────────────────────────────────── AI Comment Types

export interface AiCommentResponse {
  success: boolean;
  itemId: string;
  comment: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

// ────────────────────────────────────── Vectorize AI Items

export interface VectorizeAiItemsResponse {
  success: boolean;
  totalItems: number;
  chunksUpdated: number;
  results?: { aiItemId: number; chunksUpdated: number }[];
  errors?: { aiItemId: number; message: string }[];
}

// ────────────────────────────────────── Natural Query & Agent Script Types

export interface NaturalQueryResponse {
  success: boolean;
  human: string;
  raw: any;
  scriptId: number | null;
  cached: boolean;
  last_result?: {
    raw: any;
    human: string;
    executed_at: string;
  } | null;
}

export interface NaturalQueryErrorResponse {
  success: false;
  error: string;
  human: string;
  scriptId: number | null;
  script: string | null;
  cached: boolean;
  last_result?: {
    raw: any;
    human: string;
    executed_at: string;
  } | null;
}

export interface AgentScript {
  id: number;
  context_code: string;
  question: string;
  script: string;
  usage_count: number;
  is_valid: boolean;
  created_at: string;
  updated_at: string;
  last_result?: {
    raw: any;
    human: string;
    executed_at: string;
  } | null;
}

export interface AgentScriptsResponse {
  success: boolean;
  scripts: AgentScript[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface AgentScriptDetailResponse {
  success: boolean;
  script: AgentScript;
}

// ────────────────────────────────────── Natural Query Suggest Types

export interface SuggestSuggestion {
  id: number;
  question: string;
  similarity: number;
  usage_count: number;
  is_valid: boolean;
  last_result?: {
    raw: any;
    human: string;
    executed_at: string;
  } | null;
}

export interface SuggestResponse {
  success: boolean;
  high_confidence: boolean;
  suggestions: SuggestSuggestion[];
}

// ────────────────────────────────────── Prompts Types (v2.4.0)

export interface PromptTemplate {
  prompt: string;
  inputText: string;
}

export interface NaturalQueryPrompts {
  scriptGeneration: string; // плейсхолдер: {question}
  humanize: string;         // плейсхолдеры: {question}, {rawData}
}

export interface RagPrompts {
  systemPrompt: string;
  userPromptTemplate: string; // плейсхолдеры: {context}, {question}
}

export interface VectorOperationsPrompts {
  qaPromptTemplate: string; // плейсхолдеры: {context}, {question}
}

export interface L1L2TemplateLevel {
  l1?: PromptTemplate;
  l2?: PromptTemplate;
}

export interface L1L2Templates {
  sql?: Record<string, L1L2TemplateLevel>;
  js?: Record<string, L1L2TemplateLevel>;
  md?: Record<string, L1L2TemplateLevel>;
}

export interface PromptsConfig {
  l1l2Templates: L1L2Templates;
  rag: RagPrompts;
  naturalQuery: NaturalQueryPrompts;
  vectorOperations: VectorOperationsPrompts;
}

export interface PromptsConfigResponse {
  success: boolean;
  prompts: PromptsConfig;
  savedAt?: string;
}

export interface PromptCategoryResponse {
  success: boolean;
  category: string;
  data: any;
}

// ────────────────────────────────────── Tags Types (v2.5.0)

export interface Tag {
  id: number;
  code: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string | null;
}

// Упрощённая версия тега для списков
export interface TagSummary {
  id: number;
  code: string;
  name: string;
}

export interface TagsListResponse {
  success: boolean;
  tags: Tag[];
}

export interface TagResponse {
  success: boolean;
  tag: Tag;
}

export interface ItemTagsResponse {
  success: boolean;
  itemId: string;
  tags: Tag[];
}

// ────────────────────────────────────── Bulk Tags Operations Types (v2.5.1)

export interface BulkTagsRequest {
  itemIds: string[];
  tagCodes: string[];
}

export interface BulkTagsResponse {
  success: boolean;
  processedItems: number;
  failedItems?: {
    itemId: string;
    error: string;
  }[];
}

// ────────────────────────────────────── Column Extraction Types

export interface ColumnInfo {
  fullName: string;
  operation: 'reads_column' | 'updates_column' | 'inserts_column';
  resolved: boolean;
}

export interface ColumnExtractionReport {
  functionFullName: string;
  functionAiItemId: number;
  columnsFound: number;
  columnsResolved: number;
  columnsUnresolved: number;
  columnsAmbiguous?: number;
  linksCreated: number;
  columns: ColumnInfo[];
}

export interface ColumnExtractionResponse {
  success: boolean;
  report: ColumnExtractionReport;
}