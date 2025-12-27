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
  STRUCT = 'struct'        // For Go
}

export interface AiItem {
  id: string;
  type: AiItemType;
  language: Language;
  l0_code: string;
  l1_deps: string[];
  l2_desc: string;
  filePath: string;
}

export interface AiItemSummary {
  id: string;
  type: AiItemType;
  language: Language;
  filePath: string;
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