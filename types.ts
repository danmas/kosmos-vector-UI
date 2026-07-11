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

// ────────────────────────────────────── RAG Types (v2.7.0)

export type RAGStrategy = 'simple' | 'hierarchical' | 'aiitem' | 'hybrid' | 'ontology';
export type ChunkLevel = '0-исходник' | '1-связи' | '2-логика';
export type FormattingStyle = 'compact' | 'standard' | 'full' | 'markdown';

// ────────────────────────────────────── Ontology Types (concept-first retrieval)

export interface OntologyConcept {
  full_name: string;
  name: string;
  similarity: number;
}

export interface OntologyChainLink {
  source: string;
  relation: string;
  target: string;
}

export interface OntologyChunkRef {
  concept: string;
  role: string;
  item: string;
  chunk: string;
  similarity: number | null;
}

export interface OntologyAskRequest {
  question: string;
  contextCode?: string;
  maxConcepts?: number;
  maxChunks?: number;
  generateAnswer?: boolean;
}

export interface OntologyAskResponse {
  question: string;
  contextCode: string;
  concepts: OntologyConcept[];
  chain: OntologyChainLink[];
  chunks: OntologyChunkRef[];
  answer?: string;
  answerError?: string;
  contextText?: string;
  note?: string;
}

// ────────────────────────────────────── Ontology Builder (Step 6)

export type OntologyBuildDepth = 'concepts' | 'concepts+grounding';
export type OntologyRelationType =
  | 'part_of'
  | 'uses'
  | 'manages'
  | 'produces'
  | 'consumes'
  | 'precedes'
  | 'related_to';
export type OntologyGroundingRole =
  | 'implemented_in'
  | 'stored_in'
  | 'documented_in'
  | 'configured_in';

export interface OntologyGroundingCandidate {
  role: OntologyGroundingRole;
  target: string;
  confidence: number;
  source: string;
  accepted?: boolean;
}

export interface OntologyRelationDraft {
  type: OntologyRelationType;
  target: string;
  comment?: string;
}

export interface OntologyConceptCandidate {
  id: string;
  name: string;
  rationale?: string;
  description?: string;
  aspects?: string[];
  relations?: OntologyRelationDraft[];
  groundingCandidates?: OntologyGroundingCandidate[];
  accepted?: boolean;
}

export interface OntologyBuildSuggestRequest {
  maxConcepts?: number;
  aspects?: string[];
  seedConcepts?: string[];
  depth?: OntologyBuildDepth;
  contextCode?: string;
}

export interface OntologyBuildSuggestResponse {
  contextCode: string;
  depth: OntologyBuildDepth;
  maxConcepts: number;
  source: string;
  model?: string | null;
  suggestedAt: string;
  concepts: OntologyConceptCandidate[];
  meta?: {
    anchorsConsidered?: number;
    seedExcluded?: number;
    importedConceptsRaw?: number;
    importedConceptsAccepted?: number;
  };
}

/** Export prompts for external / BYO LLM chat */
export interface OntologyBuildExportPromptResponse {
  contextCode: string;
  systemPrompt: string;
  userPrompt: string;
  combinedForChat: string;
  modelHint?: string | null;
  maxConcepts: number;
  anchorsInPrompt: number;
  tablesInPrompt?: number;
  seedMode?: string;
  seedAvoidCount?: number;
  existingConceptsListed?: number;
  seedExcluded: number;
  howTo: string[];
  exportedAt: string;
}

/** Import pasted LLM JSON as if Suggest ran */
export interface OntologyBuildImportRequest extends OntologyBuildSuggestRequest {
  text: string;
  runDescriptionPass?: boolean;
}

/** POST /api/ontology/clear */
export interface OntologyClearResponse {
  contextCode: string;
  dryRun: boolean;
  deleteDb: boolean;
  deleteFiles: boolean;
  conceptsFound: number;
  conceptIds: string[];
  linksDeleted: number;
  chunksDeleted: number;
  aiItemsDeleted: number;
  filesDeletedDb: number;
  mdFilesDeleted: string[];
  mdFilesSkipped: string[];
  dirs: string[];
  warnings: string[];
  clearedAt?: string;
  success: boolean;
}

export interface OntologyBuildMaterializeRequest {
  concepts: OntologyConceptCandidate[];
  overwrite?: boolean;
  dryRun?: boolean;
  contextCode?: string;
}

export interface OntologyBuildMaterializeResponse {
  contextCode: string;
  outDir: string;
  dirs?: string[];
  dirsSource?: 'request' | 'config' | 'default';
  configUpdated?: boolean;
  warning?: string | null;
  written: Array<{ id: string; path: string }>;
  skippedExisting?: Array<{ id: string; path?: string; reason: string }>;
  conflicts: Array<{ id: string; path?: string; reason: string }>;
  previews?: Array<{ id: string; path: string; preview: string }>;
  dryRun?: boolean;
  error?: string;
}

export interface OntologyBuildApplyRequest {
  concepts?: OntologyConceptCandidate[];
  overwrite?: boolean;
  contextCode?: string;
}

export interface OntologyValidateSummary {
  brokenGrounding: number;
  staleGroundingTargets: number;
  conceptsWithoutGrounding: number;
  danglingRelations: number;
  coverage?: string;
  ok: boolean;
}

export interface OntologyBuildApplyResponse {
  contextCode: string;
  startedAt: string;
  finishedAt?: string;
  materialize?: OntologyBuildMaterializeResponse | null;
  load?: {
    success: boolean;
    conceptsLoaded?: number;
    dirs?: unknown[];
  } | null;
  vectorize?: {
    vectorized?: number;
    totalChunks?: number;
    skippedEmpty?: number;
    batchErrors?: number;
  } | null;
  validate?: {
    summary: OntologyValidateSummary;
    details?: {
      coverageByType?: Array<{ type: string; total: number; covered: number }>;
      uncoveredSamples?: Array<{ full_name: string; type: string; chunks: number }>;
      brokenGrounding?: unknown[];
      staleGrounding?: unknown[];
      conceptsWithoutGrounding?: string[];
    };
  } | null;
  success: boolean;
  abortedAt?: string | null;
  error?: { message: string; errors?: string[]; conflicts?: unknown } | null;
}

export interface OntologyBuilderStatus {
  conceptsInDb: number;
  draftFiles: number;
  verifiedFiles: number;
  vectorizedReality: number;
  conceptsDir?: string | null;
  dirsSource?: string | null;
  ontoLoadingOk?: boolean;
  ontoLoadingReason?: string | null;
  ontoLoadingExampleDir?: string | null;
  gated: boolean;
  gateReason: string | null;
}

export interface RAGFormattingConfig {
  style?: FormattingStyle;
  includeFileNames?: boolean;
  includeRelations?: boolean;
  maxTokens?: number;
}

export interface RAGItemFilter {
  mode: 'expression';
  typeCodes?: string[];  // ['function', 'class', ...]
  tagCodes?: string[];   // ['IMP', 'REF', ...]
}

export interface RAGRetrieveRequest {
  query: string;
  contextCode: string;
  strategy?: RAGStrategy;
  maxChunks?: number;
  levels?: ChunkLevel[];
  includeRelations?: boolean;
  formatting?: RAGFormattingConfig;
  itemFilter?: RAGItemFilter;  // новое поле
}

export interface ContextSection {
  aiItem?: {
    id: string;
    type: string;
    full_name: string;
  };
  source?: {
    id: string;
    content: string;
    level: string;
  };
  description?: {
    id: string;
    content: string;
    level: string;
  };
  dependencies?: Array<{
    id: string;
    content: string;
    level: string;
  }>;
  relations?: Array<{
    target: string;
    type: string;
  }>;
}

export interface RAGContextMetadata {
  totalChunks: number;
  totalTokens: number;
  usedChunkIds: string[];
  strategy: RAGStrategy;
  formattingStyle: FormattingStyle;
}

export interface RAGRetrieveResponse {
  success: boolean;
  context: {
    formatted: string;
    sections: ContextSection[];
    metadata: RAGContextMetadata;
  };
  retrievalTime: number;
  timestamp: string;
}

export interface RAGAskRequest {
  query: string;
  contextCode: string;
  ragConfig?: Partial<RAGRetrieveRequest>;
  llmConfig?: {
    model?: string;
    temperature?: number;
    systemPrompt?: string;
  };
}

export interface RAGAskResponse {
  success: boolean;
  answer: string;
  context: RAGContextMetadata;
  retrievalTime: number;
  timestamp: string;
}

export interface StrategyInfo {
  name: string;
  description: string;
  useCases: string[];
  performance: 'Высокая' | 'Средняя' | 'Низкая';
  complexity: 'Низкая' | 'Средняя' | 'Высокая';
}

export interface StrategiesResponse {
  success: boolean;
  strategies: StrategyInfo[];
}

export interface CompareStrategiesRequest {
  query: string;
  contextCode: string;
  strategies?: RAGStrategy[];
  maxChunks?: number;
}

export interface CompareStrategiesResult {
  strategy: string;
  totalChunks: number;
  totalTokens: number;
  retrievalTime: number;
  chunksPreview: any[];
}

export interface CompareStrategiesResponse {
  success: boolean;
  results: CompareStrategiesResult[];
  timestamp: string;
}

// ────────────────────────────────────── App Config Types (v2.8.0)

/** Ontology Builder (Step 6) settings — config.json.ontology_builder */
export interface OntologyBuilderConfig {
  model?: string | null;
  maxConcepts?: number;
  depth?: 'concepts' | 'concepts+grounding';
  temperature?: number;
  systemPrompt?: string;
  userPromptTemplate?: string;
  descriptionSystemPrompt?: string;
  descriptionPrompt?: string;
  /** Appended to every suggest/export user message */
  outputRulesSuffix?: string;
  /** Retry after truncated JSON */
  retrySystemPrompt?: string;
  retryUserTemplate?: string;
  /** BYO chat footer instruction */
  byoInstruction?: string;
  excludeNamePatterns?: string[];
  enableDescriptionPass?: boolean;
  /** user-only: seed = UI seeds only (default). all-existing: dump every concept id (legacy). */
  seedMode?: 'user-only' | 'all-existing';
}

export interface AppConfig {
  KOSMOS_BASE_URL: string;           // URL формат
  KOSMOS_MODEL: string;              // Строка модели
  KOSMOS_LOGIC_ARHITECT_MODEL: string | null;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  NATURAL_QUERY_SUGGEST_LIMIT: number;        // 1-100
  NATURAL_QUERY_SIMILARITY_THRESHOLD: number;  // 0-1
  NATURAL_QUERY_AUTO_USE_THRESHOLD: number;    // 0-1
  ontology_builder?: OntologyBuilderConfig;
}

export interface AppConfigResponse {
  success: true;
  config: AppConfig;
  /** Factory defaults (e.g. full ontology_builder prompts for Reset in Settings) */
  factory?: {
    ontology_builder?: OntologyBuilderConfig;
  };
}

export interface AppConfigUpdateRequest {
  KOSMOS_BASE_URL?: string;
  KOSMOS_MODEL?: string;
  KOSMOS_LOGIC_ARHITECT_MODEL?: string | null;
  LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  NATURAL_QUERY_SUGGEST_LIMIT?: number;
  NATURAL_QUERY_SIMILARITY_THRESHOLD?: number;
  NATURAL_QUERY_AUTO_USE_THRESHOLD?: number;
  ontology_builder?: OntologyBuilderConfig;
}

export interface AppConfigUpdateResponse {
  success: true;
  config: AppConfig;
  message: string;
}

export interface AppConfigValidationError {
  success: false;
  error: string;
  validationErrors: string[];
}

export interface AppConfigErrorResponse {
  success: false;
  error: string;
}

// ────────────────────────────────────── Prompts Config API Types (v2.9.0)

/**
 * Запись в истории изменений промптов (краткая)
 */
export interface PromptsHistoryEntry {
  id: number;
  version: number;
  createdAt: string; // ISO 8601
  comment: string | null;
}

/**
 * Запись в истории изменений промптов (полная)
 */
export interface PromptsHistoryEntryFull extends PromptsHistoryEntry {
  config: PromptsConfig;
}

/**
 * Запрос на обновление конфигурации промптов (v2.9.0)
 */
export interface PromptsConfigUpdateRequest {
  updates: Partial<PromptsConfig>;
  comment?: string;
}

/**
 * Ответ API при обновлении конфигурации промптов (v2.9.0)
 */
export interface PromptsConfigUpdateResponse {
  success: boolean;
  config: PromptsConfig;
  historyEntry: PromptsHistoryEntry;
  message: string;
}

/**
 * Ответ API при получении истории промптов (v2.9.0)
 */
export interface PromptsConfigHistoryResponse {
  success: boolean;
  history: PromptsHistoryEntry[];
  count: number;
}

/**
 * Ответ API при получении конкретной версии из истории (v2.9.0)
 */
export interface PromptsConfigHistoryEntryResponse {
  success: boolean;
  historyEntry: PromptsHistoryEntryFull;
}

/**
 * Ответ API с ошибкой для промптов (v2.9.0)
 */
export interface PromptsConfigErrorResponse {
  success: false;
  error: string;
  validationErrors?: string[];
}

// ────────────────────────────────────── Item Types API (v2.10.0)

export interface ItemType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface ItemTypeListResponse {
  success: boolean;
  types: ItemType[];
}

export interface ItemTypeResponse {
  success: boolean;
  itemType: ItemType;
}

export interface ItemTypeItemsResponse {
  success: boolean;
  itemType: ItemType;
  items: AiItemSummary[];
}

export interface ItemTypeCreateRequest {
  code: string;
  name: string;
  description?: string | null;
}

export interface ItemTypeUpdateRequest {
  name?: string;
  description?: string | null;
}

// ────────────────────────────────────── Ask API Types (Model Test)

export interface AskRequest {
  message: string;
  systemPrompt?: string | null;
  model?: string | null;
}

export interface AskResponse {
  response: string;
  timestamp: string;
}

// ────────────────────────────────────── Graph Snapshot Types (Graph View)

/** Снимок состояния графа для сохранения/восстановления */
export interface GraphSnapshot {
  id: string;                    // Уникальный ID (uuid или timestamp)
  name: string;                  // Название/описание снимка
  createdAt: string;             // ISO 8601 дата создания
  contextCode: string;           // Код контекста БЗ
  
  // Данные графа
  nodeIds: string[];             // ID узлов на графе
  selectedNodeIds: string[];     // ID выделенных узлов (обведённых)
  focusedNodeIds: string[];      // ID фокусных узлов
  hiddenLinkTypes: string[];     // Скрытые типы связей
  
  // Метаданные для превью
  nodeCount: number;             // Количество узлов
  linkCount: number;             // Количество связей
  previewNodeNames: string[];    // Первые N имён узлов для превью
}

export interface GraphSnapshotsStorage {
  version: number;
  snapshots: GraphSnapshot[];
}

// ────────────────────────────────────── Graph Snapshot API Types

/** Запрос на создание снимка */
export interface GraphSnapshotCreateRequest {
  name: string;
  nodeIds: string[];
  selectedNodeIds?: string[];
  focusedNodeIds?: string[];
  hiddenLinkTypes?: string[];
  linkCount?: number;
  previewNodeNames?: string[];
}

/** Запрос на обновление снимка */
export interface GraphSnapshotUpdateRequest {
  name?: string;
}

/** Ответ со списком снимков */
export interface GraphSnapshotListResponse {
  success: boolean;
  snapshots: GraphSnapshot[];
}

/** Ответ с одним снимком */
export interface GraphSnapshotResponse {
  success: boolean;
  snapshot: GraphSnapshot;
}

/** Ответ на удаление */
export interface GraphSnapshotDeleteResponse {
  success: boolean;
  message: string;
}

/** Ответ на экспорт снимков */
export interface GraphSnapshotsExportResponse {
  success: boolean;
  version: number;
  snapshots: GraphSnapshot[];
  exportedAt: string;
  contextCode?: string;
}

/** Запрос на импорт снимков */
export interface GraphSnapshotsImportRequest {
  version: number;
  snapshots: GraphSnapshot[];
}

/** Ответ на импорт снимков */
export interface GraphSnapshotsImportResponse {
  success: boolean;
  imported: number;
  skipped: number;
  total: number;
  message?: string;
}