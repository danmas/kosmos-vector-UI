import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { minimatch } from 'minimatch';

// Pipeline imports
import { pipelineManager } from './pipeline/PipelineManager.js';
import { progressTracker } from './pipeline/ProgressTracker.js';
import { errorHandler } from './pipeline/ErrorHandler.js';

// Contract validation middleware
import { contractValidationMiddleware } from './middleware/contractValidator.js';

// ES modules compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Add middleware for parsing JSON
app.use(express.json());

// Add contract validation middleware (enabled in development)
app.use(contractValidationMiddleware({
  enabled: process.env.VALIDATE_CONTRACT === 'true' || process.env.NODE_ENV === 'development',
  logErrors: true,
  logWarnings: process.env.NODE_ENV === 'development',
  throwOnError: false
}));

// Получаем порт из переменной окружения или используем 3200 по умолчанию
const PORT = process.env.PORT || 3200;

// Папка, которую будем сканировать (по умолчанию - корень самого проекта)
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '../');

// --- KNOWLEDGE BASE CONFIGURATION SYSTEM ---
const CONFIG_DIR = path.join(__dirname, 'config');
const KB_CONFIG_FILE = path.join(CONFIG_DIR, 'kb-settings.json');

// Конфигурация по умолчанию для v2.1.1
const DEFAULT_KB_CONFIG = {
  // Обратная совместимость со старой моделью
  targetPath: './',
  includeMask: '**/*.{py,js,ts,tsx,go,java}',
  ignorePatterns: '**/tests/*, **/venv/*, **/node_modules/*, **/.cursor/**, **/.git/**, **/.vscode/**',
  
  // Новые обязательные поля v2.1.1
  rootPath: PROJECT_ROOT, // Абсолютный путь к проекту на сервере
  fileSelection: [], // Точный список выбранных относительных путей
  
  // Новые опциональные поля
  metadata: {
    projectName: "AiItem RAG Architect",
    description: "Knowledge base processing project",
    version: "2.1.1"
  },
  
  lastUpdated: new Date().toISOString()
};

// Текущая конфигурация KB в памяти
let currentKbConfig = { ...DEFAULT_KB_CONFIG };

// Создаем папку config если её нет
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Функция загрузки конфигурации KB с миграцией v2.1.1
function loadKbConfig() {
  try {
    if (fs.existsSync(KB_CONFIG_FILE)) {
      const configData = fs.readFileSync(KB_CONFIG_FILE, 'utf8');
      const config = JSON.parse(configData);
      
      // Миграция старой конфигурации на новую модель v2.1.1
      let migratedConfig = { ...config };
      let needsMigration = false;
      
      // Миграция: rootPath из targetPath если отсутствует
      if (!migratedConfig.rootPath && migratedConfig.targetPath) {
        if (migratedConfig.targetPath === './') {
          migratedConfig.rootPath = PROJECT_ROOT;
        } else {
          // Преобразуем относительный путь в абсолютный
          migratedConfig.rootPath = path.resolve(PROJECT_ROOT, migratedConfig.targetPath);
        }
        needsMigration = true;
        console.log(`[KB Config] Migrated targetPath '${migratedConfig.targetPath}' to rootPath '${migratedConfig.rootPath}'`);
      }
      
      // Миграция: инициализация fileSelection если отсутствует
      if (!migratedConfig.fileSelection) {
        migratedConfig.fileSelection = [];
        needsMigration = true;
        console.log(`[KB Config] Initialized empty fileSelection array for v2.1.1 compatibility`);
      }
      
      // Миграция: инициализация metadata если отсутствует
      if (!migratedConfig.metadata) {
        migratedConfig.metadata = DEFAULT_KB_CONFIG.metadata;
        needsMigration = true;
        console.log(`[KB Config] Added default metadata for v2.1.1 compatibility`);
      }
      
      // Валидация и заполнение недостающих полей
      currentKbConfig = {
        ...DEFAULT_KB_CONFIG,
        ...migratedConfig,
        lastUpdated: new Date().toISOString() // Всегда обновляем время загрузки
      };
      
      // Автоматически сохраняем миграцию
      if (needsMigration) {
        console.log(`[KB Config] Configuration migrated to v2.1.1 format, saving...`);
        saveKbConfig();
      }
      
      console.log(`[KB Config] Loaded configuration from ${KB_CONFIG_FILE}`);
    } else {
      console.log(`[KB Config] No config file found, creating default v2.1.1 configuration`);
      currentKbConfig = { ...DEFAULT_KB_CONFIG };
      saveKbConfig(); // Создаем файл с настройками по умолчанию
    }
  } catch (error) {
    console.error(`[KB Config] Failed to load configuration:`, error.message);
    currentKbConfig = { ...DEFAULT_KB_CONFIG };
    // Пытаемся сохранить дефолтную конфигурацию при ошибке
    try {
      saveKbConfig();
    } catch (saveError) {
      console.error(`[KB Config] Failed to save default configuration:`, saveError.message);
    }
  }
}

// Функция сохранения конфигурации KB
function saveKbConfig() {
  try {
    currentKbConfig.lastUpdated = new Date().toISOString();
    fs.writeFileSync(KB_CONFIG_FILE, JSON.stringify(currentKbConfig, null, 2), 'utf8');
    console.log(`[KB Config] Configuration saved to ${KB_CONFIG_FILE}`);
  } catch (error) {
    console.error(`[KB Config] Failed to save configuration:`, error.message);
  }
}

// Загружаем конфигурацию при запуске
loadKbConfig();

// --- LOGGING SYSTEM ---
const MAX_LOGS = 1000;
const serverLogs = [];

// Store active SSE connections for logs
const logsSseConnections = new Set();

function addLog(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const entry = {
        id: Date.now().toString() + Math.random().toString().slice(2),
        timestamp,
        level,
        message: message + (formattedArgs ? ' ' + formattedArgs : '')
    };
    
    serverLogs.unshift(entry);
    if (serverLogs.length > MAX_LOGS) serverLogs.pop();
    
    process.stdout.write(`[${level}] ${message} ${formattedArgs}\n`);
    
    // Broadcast log to all connected SSE clients
    if (logsSseConnections.size > 0) {
        const message = `data: ${JSON.stringify({
            type: 'log',
            log: entry,
            timestamp: Date.now()
        })}\n\n`;
        
        logsSseConnections.forEach(res => {
            try {
                res.write(message);
            } catch (error) {
                console.error('Failed to send log via SSE:', error);
                logsSseConnections.delete(res);
            }
        });
    }
}

const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => addLog('INFO', ...args);
console.error = (...args) => addLog('ERROR', ...args);
console.warn = (...args) => addLog('WARN', ...args);
// --- END LOGGING SYSTEM ---

// --- MOCK DATA ---
const AiItemType = {
  FUNCTION: 'function',
  CLASS: 'class',
  METHOD: 'method',
  MODULE: 'module',
  INTERFACE: 'interface',
  STRUCT: 'struct'
};

const MOCK_AI_ITEMS = [
  {
    id: 'parser.parse_file',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'backend/parser.py',
    l0_code: 'def parse_file(path):\n    with open(path) as f:\n        tree = ast.parse(f.read())\n    return tree',
    l1_deps: [],
    l2_desc: 'Parses a single Python file into an AST object.'
  },
  {
    id: 'core.AiItem',
    type: AiItemType.CLASS,
    language: 'python',
    filePath: 'ai_item/core.py',
    l0_code: 'class AiItem:\n    def __init__(self, id, type):\n        self.id = id\n        self.type = type',
    l1_deps: [],
    l2_desc: 'Base class representing an atomic unit of knowledge in the codebase.'
  },
  {
    id: 'generator.generate_l2',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'ai_item/generator.py',
    l0_code: 'def generate_l2(item):\n    prompt = f"Describe {item.l0}"\n    return llm.invoke(prompt)',
    l1_deps: ['core.AiItem', 'utils.llm_client'],
    l2_desc: 'Generates the L2 semantic description for an AiItem using an external LLM.'
  },
  {
    id: 'graph.build_graph',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'ai_item/graph.py',
    l0_code: 'def build_graph(items):\n    G = nx.DiGraph()\n    for item in items:\n        G.add_node(item.id)\n    return G',
    l1_deps: ['core.AiItem'],
    l2_desc: 'Constructs a NetworkX directed graph from a list of AiItems.'
  },
  {
    id: 'main.run_pipeline',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'backend/main.py',
    l0_code: 'def run_pipeline(path):\n    items = parser.parse_file(path)\n    enriched = generator.generate_l2(items)\n    graph.build_graph(enriched)',
    l1_deps: ['parser.parse_file', 'generator.generate_l2', 'graph.build_graph'],
    l2_desc: 'Orchestrates the entire RAG extraction pipeline from parsing to graph construction.'
  },
  {
    id: 'utils.llm_client',
    type: AiItemType.FUNCTION,
    language: 'python',
    filePath: 'backend/utils.py',
    l0_code: 'def llm_client(prompt):\n    return requests.post(API_URL, json={"prompt": prompt})',
    l1_deps: [],
    l2_desc: 'Helper function to communicate with the LLM API.'
  },
  {
    id: 'App.render',
    type: AiItemType.FUNCTION,
    language: 'typescript',
    filePath: 'frontend/App.tsx',
    l0_code: 'const App: React.FC = () => {\n  useEffect(() => { api.fetchData(); }, []);\n  return <div>AiItem Dashboard</div>;\n};',
    l1_deps: ['api.fetchData'],
    l2_desc: 'Main React component entry point that triggers initial data fetching.'
  },
  {
    id: 'api.fetchData',
    type: AiItemType.FUNCTION,
    language: 'typescript',
    filePath: 'frontend/api.ts',
    l0_code: 'export const fetchData = async () => {\n  const res = await fetch("/api/graph");\n  return res.json();\n};',
    l1_deps: [],
    l2_desc: 'Asynchronous utility to fetch graph data from the backend.'
  },
  {
    id: 'service.ProcessingJob',
    type: AiItemType.STRUCT,
    language: 'go',
    filePath: 'backend/service.go',
    l0_code: 'type ProcessingJob struct {\n    ID string\n    Status string\n    Payload []byte\n}',
    l1_deps: [],
    l2_desc: 'Go struct defining the schema for a background processing job.'
  },
  {
    id: 'auth.Authenticator',
    type: AiItemType.INTERFACE,
    language: 'java',
    filePath: 'backend/Auth.java',
    l0_code: 'public interface Authenticator {\n    boolean login(String user, String pass);\n    void logout(String token);\n}',
    l1_deps: [],
    l2_desc: 'Java Interface defining the contract for authentication providers.'
  }
];

// --- Gemini Service Setup ---
let GoogleGenAI;

// Async function to initialize Gemini
async function initializeGemini() {
  try {
    const geminiModule = await import('@google/genai');
    GoogleGenAI = geminiModule.GoogleGenAI;
    console.log('Gemini SDK loaded successfully');
  } catch (error) {
    console.warn('Gemini SDK not available. Install @google/genai for chat functionality.');
  }
}

const getGeminiClient = () => {
  if (!GoogleGenAI) {
    throw new Error('Gemini SDK not installed');
  }
  
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error('API_KEY environment variable is missing');
  }
  
  return new GoogleGenAI({ apiKey });
};

const queryRagAgent = async (query, contextItems) => {
  // Same retrieval logic as client-side
  const relevantItems = contextItems.filter(item => 
    query.toLowerCase().includes(item.id.split('.')[0].toLowerCase()) ||
    query.toLowerCase().includes(item.type.toLowerCase()) ||
    item.l2_desc.toLowerCase().split(' ').some(word => query.toLowerCase().includes(word) && word.length > 4)
  ).slice(0, 3);

  const finalContext = relevantItems.length > 0 ? relevantItems : contextItems.slice(0, 2);

  const contextString = finalContext.map(item => `
---
ID: ${item.id}
TYPE: ${item.type}
LANGUAGE: ${item.language}
FILE: ${item.filePath}
DESCRIPTION (L2): ${item.l2_desc}
SOURCE (L0):
${item.l0_code}
---
`).join('\n');

  const systemPrompt = `
You are the "AiItem RAG Agent", an intelligent assistant capable of answering questions about a specific codebase (Polyglot: Python, TS, Go, etc.) based on retrieved context.

Here is the retrieved context (AiItems) relevant to the user's query:
${contextString}

Instructions:
1. Use the provided context to answer the user's question technically and precisely.
2. If the context explains the code, cite the function/class names.
3. If the context is insufficient, state that you don't have that information in the vectorized knowledge base.
4. Be concise and developer-focused.
5. Be mindful of the programming language indicated in the context.
`;

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: query,
      config: {
        systemInstruction: systemPrompt,
      }
    });

    return {
      text: response.text || "No response generated.",
      usedContextIds: finalContext.map(i => i.id)
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

// --- END MOCK DATA ---

// Middleware: CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Middleware: Logging
app.use((req, res, next) => {
    // Фильтруем частые polling запросы - не логируем успешные GET к /api/pipeline/steps/status
    const isPollingRequest = req.method === 'GET' && req.url.startsWith('/api/pipeline/steps/status');
    
    if (isPollingRequest) {
        // Перехватываем ответ, чтобы проверить статус
        const originalSend = res.send;
        const originalJson = res.json;
        
        const logIfError = () => {
            if (res.statusCode >= 400) {
                console.log(`${req.method} ${req.url} - Status: ${res.statusCode}`);
            }
        };
        
        res.send = function(...args) {
            logIfError();
            return originalSend.apply(this, args);
        };
        
        res.json = function(...args) {
            logIfError();
            return originalJson.apply(this, args);
        };
        
        next();
    } else {
        // Логируем все остальные запросы как обычно
        console.log(`${req.method} ${req.url}`);
        next();
    }
});

app.get('/api/logs', (req, res) => {
    res.json(serverLogs);
});

// POST endpoint для записи логов с клиента
app.post('/api/logs', (req, res) => {
    try {
        const { level, message } = req.body;
        
        // Валидация входных данных
        if (!level || !message) {
            return res.status(400).json({
                success: false,
                error: 'Level and message are required'
            });
        }
        
        const validLevels = ['INFO', 'WARN', 'ERROR'];
        if (!validLevels.includes(level)) {
            return res.status(400).json({
                success: false,
                error: `Invalid level. Must be one of: ${validLevels.join(', ')}`
            });
        }
        
        // Записываем лог через существующую функцию
        addLog(level, `[Client] ${message}`);
        
        res.json({
            success: true,
            message: 'Log added successfully'
        });
    } catch (error) {
        console.error('[POST /api/logs] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// SSE endpoint for real-time logs
app.get('/api/logs/stream', (req, res) => {
    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Add connection to active connections
    logsSseConnections.add(res);

    console.log('SSE client connected for logs');

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({
        type: 'connected',
        timestamp: Date.now()
    })}\n\n`);

    // Send current logs (last 100)
    const recentLogs = serverLogs.slice(0, 100).reverse(); // Reverse to send oldest first
    recentLogs.forEach(log => {
        res.write(`data: ${JSON.stringify({
            type: 'log',
            log: log,
            timestamp: Date.now()
        })}\n\n`);
    });

    // Handle client disconnect
    req.on('close', () => {
        console.log('SSE client disconnected for logs');
        logsSseConnections.delete(res);
    });

    req.on('error', (error) => {
        console.error('SSE error for logs:', error);
        logsSseConnections.delete(res);
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '2.1.1',
        endpoints: [
            'items', 'stats', 'graph', 'chat', 
            'files', // deprecated в пользу project/tree
            'logs', 'pipeline', 'kb-config', 'contract',
            // Новые эндпоинты v2.1.1
            'project/tree', 'project/selection'
        ]
    });
});

// API Contract endpoint - returns OpenAPI specification
app.get('/api/contract', (req, res) => {
    try {
        const format = req.query.format || 'yaml';
        const contractPath = path.join(__dirname, 'api-contract.yaml');
        
        if (!fs.existsSync(contractPath)) {
            return res.status(404).json({
                success: false,
                error: 'API contract file not found'
            });
        }
        
        const contractContent = fs.readFileSync(contractPath, 'utf8');
        
        if (format === 'json') {
            // В реальном проекте здесь был бы полноценный YAML parser (js-yaml)
            // Для упрощения возвращаем сообщение о необходимости установки парсера
            return res.json({
                success: false,
                error: 'JSON format requires js-yaml parser to be installed',
                suggestion: 'Use format=yaml or install js-yaml package'
            });
        } else if (format === 'yaml') {
            res.setHeader('Content-Type', 'application/x-yaml');
            res.send(contractContent);
        } else {
            return res.status(400).json({
                success: false,
                error: "Invalid format parameter. Use 'yaml' or 'json'"
            });
        }
        
        console.log(`[API Contract] Served contract in ${format} format`);
        
    } catch (error) {
        console.error('[API Contract] Failed to serve contract:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read API contract file'
        });
    }
});

// --- NEW API ENDPOINTS ---

// --- KNOWLEDGE BASE CONFIGURATION API ---

// GET /api/kb-config - получить текущие настройки KB
app.get('/api/kb-config', (req, res) => {
    try {
        console.log('[KB Config API] GET /api/kb-config - Retrieving KB configuration');
        res.json({
            success: true,
            config: currentKbConfig
        });
    } catch (error) {
        console.error('[KB Config API] Failed to get KB configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve KB configuration',
            details: error.message
        });
    }
});

// POST /api/kb-config - сохранить настройки KB (v2.1.1 совместимый)
app.post('/api/kb-config', (req, res) => {
    try {
        console.log('[KB Config API] POST /api/kb-config - Updating KB configuration v2.1.1');
        
        const { 
            // Старые поля (обратная совместимость)
            targetPath, 
            includeMask, 
            ignorePatterns,
            // Новые поля v2.1.1
            rootPath,
            fileSelection,
            metadata
        } = req.body;
        
        // Создаем копию текущей конфигурации для обновления
        const updatedConfig = { ...currentKbConfig };
        
        // Обновляем поля если они переданы
        if (targetPath !== undefined) {
            if (typeof targetPath !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'targetPath must be a string'
                });
            }
            updatedConfig.targetPath = targetPath.trim();
        }
        
        if (includeMask !== undefined) {
            if (typeof includeMask !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'includeMask must be a string'
                });
            }
            updatedConfig.includeMask = includeMask.trim();
        }
        
        if (ignorePatterns !== undefined) {
            if (typeof ignorePatterns !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'ignorePatterns must be a string'
                });
            }
            updatedConfig.ignorePatterns = ignorePatterns.trim();
        }
        
        // Новые поля v2.1.1
        if (rootPath !== undefined) {
            if (typeof rootPath !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'rootPath must be a string (absolute path on server)'
                });
            }
            updatedConfig.rootPath = rootPath.trim();
        }
        
        if (fileSelection !== undefined) {
            if (!Array.isArray(fileSelection)) {
                return res.status(400).json({
                    success: false,
                    error: 'fileSelection must be an array of relative paths'
                });
            }
            // Валидируем что все пути относительные и начинаются с ./
            const invalidPaths = fileSelection.filter(path => 
                typeof path !== 'string' || !path.startsWith('./'));
            if (invalidPaths.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid paths in fileSelection: ${invalidPaths.join(', ')}. All paths must be relative and start with './'`
                });
            }
            updatedConfig.fileSelection = fileSelection;
        }
        
        if (metadata !== undefined) {
            if (typeof metadata !== 'object' || metadata === null) {
                return res.status(400).json({
                    success: false,
                    error: 'metadata must be an object'
                });
            }
            updatedConfig.metadata = { ...updatedConfig.metadata, ...metadata };
        }
        
        // Обновляем текущую конфигурацию
        currentKbConfig = updatedConfig;
        
        // Сохраняем в файл
        saveKbConfig();
        
        console.log(`[KB Config API] Configuration updated (v2.1.1):`, {
            rootPath: currentKbConfig.rootPath,
            fileSelectionCount: currentKbConfig.fileSelection?.length || 0,
            includeMask: currentKbConfig.includeMask,
            ignorePatterns: currentKbConfig.ignorePatterns,
            hasMetadata: !!currentKbConfig.metadata
        });
        
        res.json({
            success: true,
            message: 'KB configuration updated successfully',
            config: currentKbConfig
        });
    } catch (error) {
        console.error('[KB Config API] Failed to update KB configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update KB configuration',
            details: error.message
        });
    }
});

// DELETE /api/vector-db - очистить векторную базу данных
app.delete('/api/vector-db', async (req, res) => {
    try {
        const contextCode = req.query['context-code'] || 'default';
        console.log(`[Vector DB API] DELETE /api/vector-db - Clearing vector database for context: ${contextCode}`);
        
        const deletedFiles = [];
        const errors = [];
        
        // Получаем путь к временной директории для индексов
        const indexPath = path.join(os.tmpdir(), 'aiitem_index');
        const indexDir = path.dirname(indexPath);
        
        // Список возможных расширений файлов индексов
        const indexExtensions = ['.faiss', '.metadata.json', '.chromadb.json', '.simple.json'];
        
        // Удаляем файлы индексов
        try {
            if (fs.existsSync(indexDir)) {
                const files = fs.readdirSync(indexDir);
                for (const file of files) {
                    const filePath = path.join(indexDir, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.isFile()) {
                        // Проверяем, является ли файл индексом
                        const isIndexFile = indexExtensions.some(ext => file.endsWith(ext)) || 
                                          file.includes('aiitem_index');
                        
                        if (isIndexFile) {
                            try {
                                fs.unlinkSync(filePath);
                                deletedFiles.push(file);
                                console.log(`[Vector DB API] Deleted index file: ${file}`);
                            } catch (err) {
                                errors.push(`Failed to delete ${file}: ${err.message}`);
                                console.error(`[Vector DB API] Error deleting ${file}:`, err);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.warn(`[Vector DB API] Error accessing index directory: ${err.message}`);
        }
        
        // Очищаем ChromaDB коллекцию (если используется)
        try {
            const { ChromaClient } = await import('chromadb');
            const client = new ChromaClient({
                path: process.env.CHROMA_PATH || 'http://localhost:8000'
            });
            
            const collectionName = process.env.CHROMA_COLLECTION || 'aiitem_vectors';
            try {
                const collection = await client.getCollection({ name: collectionName });
                // Удаляем все векторы из коллекции
                const allIds = await collection.get();
                if (allIds.ids && allIds.ids.length > 0) {
                    await collection.delete({ ids: allIds.ids });
                    console.log(`[Vector DB API] Cleared ChromaDB collection: ${collectionName} (${allIds.ids.length} vectors)`);
                }
            } catch (err) {
                // Коллекция может не существовать, это нормально
                console.log(`[Vector DB API] ChromaDB collection not found or already empty: ${collectionName}`);
            }
        } catch (err) {
            // ChromaDB может быть недоступен, это не критично
            console.log(`[Vector DB API] ChromaDB not available or not configured: ${err.message}`);
        }
        
        if (errors.length > 0 && deletedFiles.length === 0) {
            return res.status(500).json({
                success: false,
                error: `Failed to clear vector database: ${errors.join('; ')}`
            });
        }
        
        const message = deletedFiles.length > 0 
            ? `Vector database cleared successfully. Deleted ${deletedFiles.length} file(s).`
            : 'Vector database is already empty.';
        
        console.log(`[Vector DB API] Vector database cleared for context: ${contextCode}`);
        
        res.json({
            success: true,
            message: message,
            deletedFiles: deletedFiles,
            errors: errors.length > 0 ? errors : undefined
        });
        
    } catch (error) {
        console.error('[Vector DB API] Failed to clear vector database:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear vector database: ' + error.message
        });
    }
});

// GET /api/items - получение всех AiItem
app.get('/api/items', (req, res) => {
    console.log('[API] GET /api/items - Fetching all AiItems');
    res.json(MOCK_AI_ITEMS);
});

// GET /api/items-list - получение списка метаданных AiItem
app.get('/api/items-list', (req, res) => {
    console.log('[API] GET /api/items-list - Fetching items metadata');
    const itemsList = MOCK_AI_ITEMS.map(item => ({
        id: item.id,
        type: item.type,
        language: item.language,
        filePath: item.filePath
    }));
    res.json(itemsList);
});

// GET /api/items/:id - получение конкретного AiItem
app.get('/api/items/:id', (req, res) => {
    const { id } = req.params;
    console.log(`[API] GET /api/items/${id} - Fetching specific AiItem`);
    
    const item = MOCK_AI_ITEMS.find(item => item.id === id);
    if (!item) {
        return res.status(404).json({ error: `AiItem with id '${id}' not found` });
    }
    
    res.json(item);
});

// GET /api/stats - статистика для Dashboard
app.get('/api/stats', (req, res) => {
    console.log('[API] GET /api/stats - Computing dashboard statistics');
    
    const typeStats = [
        { name: 'Function', count: MOCK_AI_ITEMS.filter(i => i.type === AiItemType.FUNCTION).length },
        { name: 'Class', count: MOCK_AI_ITEMS.filter(i => i.type === AiItemType.CLASS).length },
        { name: 'Interface', count: MOCK_AI_ITEMS.filter(i => i.type === AiItemType.INTERFACE).length },
        { name: 'Struct', count: MOCK_AI_ITEMS.filter(i => i.type === AiItemType.STRUCT).length },
    ];

    const languageStats = Object.entries(MOCK_AI_ITEMS.reduce((acc, item) => {
        acc[item.language] = (acc[item.language] || 0) + 1;
        return acc;
    }, {})).map(([name, value]) => ({ name, value }));

    const totalDeps = MOCK_AI_ITEMS.reduce((acc, item) => acc + item.l1_deps.length, 0);

    const stats = {
        totalItems: MOCK_AI_ITEMS.length,
        totalDeps,
        averageDependencyDensity: (totalDeps / MOCK_AI_ITEMS.length).toFixed(1),
        typeStats,
        languageStats,
        vectorIndexSize: '5.1 MB', // Mock value
        lastScan: new Date().toISOString()
    };
    
    res.json(stats);
});

// GET /api/graph - данные для Knowledge Graph
app.get('/api/graph', (req, res) => {
    console.log('[API] GET /api/graph - Preparing graph data');
    
    const nodes = MOCK_AI_ITEMS.map(item => ({
        id: item.id,
        type: item.type,
        language: item.language,
        filePath: item.filePath,
        l2_desc: item.l2_desc
    }));
    
    const links = [];
    MOCK_AI_ITEMS.forEach(source => {
        source.l1_deps.forEach(targetId => {
            const target = MOCK_AI_ITEMS.find(t => t.id === targetId);
            if (target) {
                links.push({ 
                    source: source.id, 
                    target: target.id 
                });
            }
        });
    });
    
    res.json({ nodes, links });
});

// POST /api/chat - RAG чат
app.post('/api/chat', async (req, res) => {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query is required and must be a string' });
    }
    
    console.log(`[API] POST /api/chat - Processing query: "${query}"`);
    
    try {
        const result = await queryRagAgent(query, MOCK_AI_ITEMS);
        res.json({
            response: result.text,
            usedContextIds: result.usedContextIds,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[API] Chat error:', error);
        
        // Return different error messages based on error type
        if (error.message.includes('API_KEY')) {
            return res.status(500).json({ 
                error: 'Gemini API Key is not configured. Set API_KEY environment variable.' 
            });
        }
        
        if (error.message.includes('Gemini SDK')) {
            return res.status(500).json({ 
                error: 'Gemini SDK is not installed. Run: npm install @google/genai' 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to process chat request: ' + error.message 
        });
    }
});

// === PIPELINE API ENDPOINTS ===

// Start a new pipeline (v2.1.1 with fileSelection priority)
app.post('/api/pipeline/start', async (req, res) => {
  try {
    console.log('[Pipeline] POST /api/pipeline/start - Starting pipeline with v2.1.1 logic');
    
    // v2.1.1: Приоритет fileSelection над glob-масками
    let config = {};
    let configSource = 'unknown';
    
    // Проверяем наличие точной выборки файлов в KB конфигурации
    const hasFileSelection = currentKbConfig.fileSelection && 
                           Array.isArray(currentKbConfig.fileSelection) && 
                           currentKbConfig.fileSelection.length > 0;
    
    if (hasFileSelection) {
      // ПРИОРИТЕТ 1: Используем fileSelection из KB конфигурации
      console.log(`[Pipeline] Using fileSelection from KB config: ${currentKbConfig.fileSelection.length} files`);
      
      config = {
        projectPath: req.body.projectPath || currentKbConfig.rootPath,
        selectedFiles: currentKbConfig.fileSelection, // Используем точную выборку
        filePatterns: [], // Не используем glob-маски при точной выборке
        excludedFiles: req.body.excludedFiles || [],
        forceReparse: req.body.forceReparse || false,
        llmModel: req.body.llmModel || 'gemini-2.5-flash',
        embeddingModel: req.body.embeddingModel || 'text-embedding-ada-002',
        ...req.body
      };
      
      configSource = 'KB fileSelection (v2.1.1)';
    } else {
      // ПРИОРИТЕТ 2: Fallback на старые glob-маски
      console.log('[Pipeline] fileSelection empty, falling back to glob patterns');
      
      const defaultPath = currentKbConfig.targetPath === './' ? PROJECT_ROOT : currentKbConfig.targetPath;
      const defaultFilePatterns = currentKbConfig.includeMask ? 
        currentKbConfig.includeMask.split(',').map(p => p.trim()).filter(p => p.length > 0) :
        ['**/*.{py,ts,js,go,java}'];

      config = {
        projectPath: req.body.projectPath || defaultPath,
        filePatterns: req.body.filePatterns || defaultFilePatterns,
        selectedFiles: req.body.selectedFiles || null,
        excludedFiles: req.body.excludedFiles || [],
        forceReparse: req.body.forceReparse || false,
        llmModel: req.body.llmModel || 'gemini-2.5-flash',
        embeddingModel: req.body.embeddingModel || 'text-embedding-ada-002',
        ...req.body
      };
      
      configSource = req.body.projectPath ? 'request params (legacy)' : 'KB glob patterns (legacy)';
    }
    
    // v2.1.1: Проверяем наличие файлов для обработки
    const hasSelectedFiles = config.selectedFiles && config.selectedFiles.length > 0;
    const hasFilePatterns = config.filePatterns && config.filePatterns.length > 0;
    
    if (!hasSelectedFiles && !hasFilePatterns) {
      console.warn('[Pipeline] No files configured for processing');
      return res.status(428).json({
        success: false,
        error: 'No files configured. Set up project via /api/kb-config or /api/project/selection',
        code: 'NO_FILES_CONFIGURED'
      });
    }
    
    console.log(`[Pipeline] Using configuration from: ${configSource}`);
    console.log(`[Pipeline] Configuration summary:`, {
      projectPath: config.projectPath,
      selectedFilesCount: config.selectedFiles ? config.selectedFiles.length : 0,
      filePatternsCount: config.filePatterns ? config.filePatterns.length : 0,
      hasFileSelection: hasFileSelection,
      forceReparse: config.forceReparse
    });

    const result = await pipelineManager.startPipeline(config);
    
    console.log(`Started pipeline ${result.pipelineId} with config:`, {
      ...config,
      selectedFiles: config.selectedFiles?.length ? `${config.selectedFiles.length} files` : 'none',
      excludedFiles: config.excludedFiles?.length ? `${config.excludedFiles.length} files` : 'none'
    });
    
    res.json({
      success: true,
      pipeline: result
    });
    
  } catch (error) {
    console.error('Failed to start pipeline:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get pipeline status
app.get('/api/pipeline/:id', (req, res) => {
  try {
    const pipelineId = req.params.id;
    const status = pipelineManager.getPipelineStatus(pipelineId);
    
    res.json({
      success: true,
      pipeline: status
    });
    
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

// List all pipelines
app.get('/api/pipeline', (req, res) => {
  try {
    const pipelines = pipelineManager.getAllPipelines();
    
    res.json({
      success: true,
      pipelines
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cancel pipeline
app.delete('/api/pipeline/:id', async (req, res) => {
  try {
    const pipelineId = req.params.id;
    const result = await pipelineManager.cancelPipeline(pipelineId);
    
    console.log(`Cancelled pipeline ${pipelineId}`);
    
    res.json({
      success: true,
      pipeline: result
    });
    
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

// Get pipeline progress details
app.get('/api/pipeline/:id/progress', (req, res) => {
  try {
    const pipelineId = req.params.id;
    const session = progressTracker.getSession(pipelineId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Pipeline not found or not being tracked'
      });
    }
    
    res.json({
      success: true,
      progress: session.getDetailedStats()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get global pipeline statistics
app.get('/api/pipeline/stats/global', (req, res) => {
  try {
    const stats = progressTracker.getGlobalStats();
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get error statistics
app.get('/api/pipeline/errors', (req, res) => {
  try {
    const timeWindow = parseInt(req.query.timeWindow) || 3600000; // 1 hour default
    const stats = errorHandler.getErrorStatistics(timeWindow);
    const recentErrors = errorHandler.getRecentErrors(10);
    
    res.json({
      success: true,
      errorStats: stats,
      recentErrors
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Run a single pipeline step independently (v2.1.1 with fileSelection priority)
app.post('/api/pipeline/step/:stepId/run', async (req, res) => {
  try {
    const stepId = parseInt(req.params.stepId);
    
    if (isNaN(stepId) || stepId < 1 || stepId > 5) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stepId. Must be between 1 and 5'
      });
    }

    console.log(`[Pipeline Step] POST /api/pipeline/step/${stepId}/run - Running step with v2.1.1 logic`);
    
    // v2.1.1: Используем ту же логику приоритета что и в /api/pipeline/start
    let config = {};
    let configSource = 'unknown';
    
    const hasFileSelection = currentKbConfig.fileSelection && 
                           Array.isArray(currentKbConfig.fileSelection) && 
                           currentKbConfig.fileSelection.length > 0;
    
    if (hasFileSelection) {
      // Используем fileSelection из KB конфигурации
      config = {
        projectPath: req.body.projectPath || currentKbConfig.rootPath,
        selectedFiles: currentKbConfig.fileSelection,
        filePatterns: [],
        excludedFiles: req.body.excludedFiles || [],
        forceReparse: req.body.forceReparse || false,
        llmModel: req.body.llmModel || 'gemini-2.5-flash',
        embeddingModel: req.body.embeddingModel || 'text-embedding-ada-002',
        ...req.body
      };
      configSource = 'KB fileSelection (v2.1.1)';
    } else {
      // Fallback на glob-маски
      const defaultPath = currentKbConfig.targetPath === './' ? PROJECT_ROOT : currentKbConfig.targetPath;
      const defaultFilePatterns = currentKbConfig.includeMask ? 
        currentKbConfig.includeMask.split(',').map(p => p.trim()).filter(p => p.length > 0) :
        ['**/*.{py,ts,js,go,java}'];

      config = {
        projectPath: req.body.projectPath || defaultPath,
        filePatterns: req.body.filePatterns || defaultFilePatterns,
        selectedFiles: req.body.selectedFiles || null,
        excludedFiles: req.body.excludedFiles || [],
        forceReparse: req.body.forceReparse || false,
        llmModel: req.body.llmModel || 'gemini-2.5-flash',
        embeddingModel: req.body.embeddingModel || 'text-embedding-ada-002',
        ...req.body
      };
      configSource = req.body.projectPath ? 'request params (legacy)' : 'KB glob patterns (legacy)';
    }

    console.log(`[Pipeline Step] Using configuration from: ${configSource}`);

    const result = await pipelineManager.runStep(stepId, config);
    
    console.log(`Started step ${stepId} (${result.label})`);
    
    res.json({
      success: true,
      step: result
    });
    
  } catch (error) {
    console.error('Failed to run pipeline step:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get status of all pipeline steps
app.get('/api/pipeline/steps/status', (req, res) => {
  try {
    const steps = pipelineManager.getGlobalStepsStatus();
    
    res.json({
      success: true,
      steps
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get history of pipeline steps
app.get('/api/pipeline/steps/history', (req, res) => {
  try {
    // Парсим опциональные параметры
    const limitParam = req.query.limit;
    const stepIdParam = req.query.stepId;
    
    // Валидация и парсинг limit
    let limit = 100; // По умолчанию
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({
          success: false,
          error: 'Invalid limit parameter. Must be a positive integer.'
        });
      }
      limit = Math.min(parsedLimit, 1000); // Максимум 1000
    }
    
    // Валидация и парсинг stepId
    let stepId = null;
    if (stepIdParam) {
      const parsedStepId = parseInt(stepIdParam, 10);
      if (isNaN(parsedStepId) || parsedStepId < 1 || parsedStepId > 7) {
        return res.status(400).json({
          success: false,
          error: 'Invalid stepId parameter. Must be an integer between 1 and 7.'
        });
      }
      stepId = parsedStepId;
    }
    
    // Получаем историю
    const history = pipelineManager.getGlobalStepsHistory(stepId, limit);
    
    res.json({
      success: true,
      steps: history
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === SERVER-SENT EVENTS FOR PIPELINE PROGRESS ===

// Store active SSE connections
const sseConnections = new Map(); // pipelineId -> Set<response objects>

// SSE endpoint for pipeline progress
app.get('/api/pipeline/:id/stream', (req, res) => {
  const pipelineId = req.params.id;
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Add connection to active connections
  if (!sseConnections.has(pipelineId)) {
    sseConnections.set(pipelineId, new Set());
  }
  sseConnections.get(pipelineId).add(res);

  console.log(`SSE client connected for pipeline ${pipelineId}`);

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    pipelineId: pipelineId,
    timestamp: Date.now()
  })}\n\n`);

  // Send current pipeline status if available
  try {
    const status = pipelineManager.getPipelineStatus(pipelineId);
    res.write(`data: ${JSON.stringify({
      type: 'status',
      pipelineId: pipelineId,
      status: status,
      timestamp: Date.now()
    })}\n\n`);
  } catch (error) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      pipelineId: pipelineId,
      error: `Pipeline ${pipelineId} not found`,
      timestamp: Date.now()
    })}\n\n`);
  }

  // Handle client disconnect
  req.on('close', () => {
    console.log(`SSE client disconnected for pipeline ${pipelineId}`);
    const connections = sseConnections.get(pipelineId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        sseConnections.delete(pipelineId);
      }
    }
  });

  req.on('error', (error) => {
    console.error(`SSE error for pipeline ${pipelineId}:`, error);
    const connections = sseConnections.get(pipelineId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        sseConnections.delete(pipelineId);
      }
    }
  });
});

// Global SSE endpoint for all pipeline events
app.get('/api/pipeline/stream/global', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Add to global connections
  const globalConnectionKey = 'global';
  if (!sseConnections.has(globalConnectionKey)) {
    sseConnections.set(globalConnectionKey, new Set());
  }
  sseConnections.get(globalConnectionKey).add(res);

  console.log('Global SSE client connected');

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    scope: 'global',
    timestamp: Date.now()
  })}\n\n`);

  // Send current global stats
  try {
    const stats = progressTracker.getGlobalStats();
    res.write(`data: ${JSON.stringify({
      type: 'global_stats',
      stats: stats,
      timestamp: Date.now()
    })}\n\n`);
  } catch (error) {
    console.error('Error getting global stats for SSE:', error);
  }

  // Handle client disconnect
  req.on('close', () => {
    console.log('Global SSE client disconnected');
    const connections = sseConnections.get(globalConnectionKey);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        sseConnections.delete(globalConnectionKey);
      }
    }
  });

  req.on('error', (error) => {
    console.error('Global SSE error:', error);
    const connections = sseConnections.get(globalConnectionKey);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        sseConnections.delete(globalConnectionKey);
      }
    }
  });
});

// Helper function to broadcast SSE message
function broadcastSSE(pipelineId, data) {
  const connections = sseConnections.get(pipelineId);
  if (connections && connections.size > 0) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    
    // Send to all connections for this pipeline
    connections.forEach(res => {
      try {
        res.write(message);
      } catch (error) {
        console.error(`Failed to send SSE message to client:`, error);
        connections.delete(res);
      }
    });
  }

  // Also send to global connections
  const globalConnections = sseConnections.get('global');
  if (globalConnections && globalConnections.size > 0) {
    const globalMessage = `data: ${JSON.stringify({
      ...data,
      pipelineId: pipelineId
    })}\n\n`;
    
    globalConnections.forEach(res => {
      try {
        res.write(globalMessage);
      } catch (error) {
        console.error(`Failed to send global SSE message:`, error);
        globalConnections.delete(res);
      }
    });
  }
}

// === GLOBAL PIPELINE EVENT HANDLERS ===
// Подписываемся на события pipeline для логирования и SSE
pipelineManager.on('pipeline:progress', (data) => {
  console.log(`Pipeline ${data.pipelineId} progress: ${data.step} - ${data.progress}% (${data.message})`);
  
  // Broadcast via SSE
  broadcastSSE(data.pipelineId, {
    type: 'progress',
    timestamp: Date.now(),
    ...data
  });
});

pipelineManager.on('pipeline:step:completed', (data) => {
  console.log(`Pipeline ${data.pipelineId} completed step: ${data.step}`);
  
  // Broadcast via SSE
  broadcastSSE(data.pipelineId, {
    type: 'step_completed',
    timestamp: Date.now(),
    ...data
  });
});

pipelineManager.on('pipeline:step:failed', (data) => {
  console.error(`Pipeline ${data.pipelineId} step failed: ${data.step} - ${data.error}`);
  
  // Broadcast via SSE
  broadcastSSE(data.pipelineId, {
    type: 'step_failed',
    timestamp: Date.now(),
    ...data
  });
});

pipelineManager.on('pipeline:completed', (data) => {
  console.log(`Pipeline ${data.pipelineId} completed successfully`);
  
  // Broadcast via SSE
  broadcastSSE(data.pipelineId, {
    type: 'completed',
    timestamp: Date.now(),
    ...data
  });
  
  // Clean up SSE connections for completed pipeline after delay
  setTimeout(() => {
    const connections = sseConnections.get(data.pipelineId);
    if (connections) {
      connections.forEach(res => {
        try {
          res.write(`data: ${JSON.stringify({
            type: 'connection_closing',
            reason: 'Pipeline completed',
            timestamp: Date.now()
          })}\n\n`);
          res.end();
        } catch (error) {
          // Connection already closed
        }
      });
      sseConnections.delete(data.pipelineId);
    }
  }, 5000); // 5 seconds delay before closing connections
});

pipelineManager.on('pipeline:failed', (data) => {
  console.error(`Pipeline ${data.pipelineId} failed: ${data.error}`);
  
  // Broadcast via SSE
  broadcastSSE(data.pipelineId, {
    type: 'failed',
    timestamp: Date.now(),
    ...data
  });
  
  // Clean up SSE connections for failed pipeline after delay
  setTimeout(() => {
    const connections = sseConnections.get(data.pipelineId);
    if (connections) {
      connections.forEach(res => {
        try {
          res.write(`data: ${JSON.stringify({
            type: 'connection_closing',
            reason: 'Pipeline failed',
            timestamp: Date.now()
          })}\n\n`);
          res.end();
        } catch (error) {
          // Connection already closed
        }
      });
      sseConnections.delete(data.pipelineId);
    }
  }, 5000); // 5 seconds delay before closing connections
});

// Periodic global stats broadcast
setInterval(() => {
  const globalConnections = sseConnections.get('global');
  if (globalConnections && globalConnections.size > 0) {
    try {
      const stats = progressTracker.getGlobalStats();
      const message = `data: ${JSON.stringify({
        type: 'global_stats_update',
        stats: stats,
        timestamp: Date.now()
      })}\n\n`;
      
      globalConnections.forEach(res => {
        try {
          res.write(message);
        } catch (error) {
          globalConnections.delete(res);
        }
      });
    } catch (error) {
      console.error('Error broadcasting global stats:', error);
    }
  }
}, 5000); // Every 5 seconds

// --- PROJECT API v2.1.1 ---

// Функция для определения языка файла по расширению
function detectLanguageFromExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap = {
    '.py': 'python',
    '.js': 'javascript', 
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.java': 'java',
    '.go': 'go',
    '.kt': 'unknown',
    '.rs': 'unknown',
    '.cpp': 'unknown',
    '.c': 'unknown',
    '.h': 'unknown',
    '.hpp': 'unknown'
  };
  return languageMap[ext] || null;
}

// Новая функция для генерации дерева в формате ProjectFile (v2.1.1)
// includePatterns - массив паттернов из includeMask (например, ['**/*.sql'])
// fileSelection - точный список выбранных файлов (массив относительных путей)
// ignorePatterns - паттерны для исключения
const getProjectTree = (dirPath, rootPath, depth = 12, currentDepth = 0, includePatterns = [], ignorePatterns = [], fileSelection = []) => {
  try {
    // Проверка глубины рекурсии
    if (currentDepth >= depth) {
      return null;
    }

    // Проверка существования пути
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const stats = fs.statSync(dirPath);
    const name = path.basename(dirPath);
    
    // Вычисляем относительный путь от rootPath с префиксом ./
    const relativePath = './' + path.relative(rootPath, dirPath).replace(/\\/g, '/');
    const normalizedRelativePath = relativePath === './' ? './' : relativePath;
    
    // Функция проверки соответствия ignore паттернам
    const matchesIgnore = (filePath) => {
      if (!ignorePatterns || ignorePatterns.length === 0) {
        return false;
      }
      return ignorePatterns.some(pattern => minimatch(filePath, pattern, { dot: true }));
    };

    // Функция проверки соответствия include паттернам
    const matchesInclude = (filePath) => {
      if (!includePatterns || includePatterns.length === 0) {
        return true; // Если паттернов нет, показываем все
      }
      return includePatterns.some(pattern => minimatch(filePath, pattern, { dot: true }));
    };

    // Проверяем, нужно ли исключить этот элемент
    const shouldIgnore = matchesIgnore(normalizedRelativePath) || matchesIgnore(name);
    
    // Определяем, выбран ли файл
    let isSelected = false;
    
    if (shouldIgnore) {
      // Игнорируемые файлы всегда не выбраны
      isSelected = false;
    } else if (stats.isFile()) {
      // Для файлов: приоритет fileSelection над includeMask
      if (fileSelection && fileSelection.length > 0) {
        // Режим 1: Точный выбор - файл выбран только если он в fileSelection
        isSelected = fileSelection.includes(normalizedRelativePath);
      } else {
        // Режим 2: Glob-маски - файл выбран если соответствует includeMask
        isSelected = matchesInclude(normalizedRelativePath);
      }
    } else {
      // Для директорий: selected будет вычислен позже на основе дочерних файлов
      isSelected = false;
    }
    
    const projectFile = {
      path: normalizedRelativePath,
      name: name,
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.isFile() ? stats.size : 0,
      selected: isSelected
    };

    // Добавляем язык для файлов
    if (stats.isFile()) {
      const language = detectLanguageFromExtension(dirPath);
      if (language) {
        projectFile.language = language;
      }
    }

    // Обрабатываем директории
    if (stats.isDirectory()) {
      try {
        const items = fs.readdirSync(dirPath);
        
        // Базовые игнорируемые папки и файлы
        const baseIgnored = [
          'node_modules', '.git', '.idea', '__pycache__', 
          'dist', 'build', '.vscode', '.cursor', 'coverage', '.DS_Store',
          'venv', 'env', '.env', '.next', '.nuxt', 'target'
        ];
        
        // Фильтруем элементы
        const filtered = items.filter(item => {
          if (baseIgnored.includes(item)) return false;
          
          const itemPath = path.join(dirPath, item);
          const itemRelativePath = './' + path.relative(rootPath, itemPath).replace(/\\/g, '/');
          
          // Исключаем если соответствует ignore паттерну
          return !matchesIgnore(itemRelativePath) && !matchesIgnore(item);
        });
        
        // Рекурсивно обрабатываем дочерние элементы
        const children = filtered
          .map(child => {
            try {
              return getProjectTree(
                path.join(dirPath, child), 
                rootPath, 
                depth, 
                currentDepth + 1, 
                includePatterns,
                ignorePatterns,
                fileSelection
              );
            } catch (error) {
              // Возвращаем элемент с ошибкой вместо null
              const childPath = path.join(dirPath, child);
              const childRelativePath = './' + path.relative(rootPath, childPath).replace(/\\/g, '/');
              return {
                path: childRelativePath,
                name: child,
                type: 'file', // Предполагаем файл при ошибке доступа
                size: 0,
                selected: false,
                error: true,
                errorMessage: error.message
              };
            }
          })
          .filter(child => child !== null);
        
        if (children.length > 0) {
          projectFile.children = children;
          
          // Для папок: выбрана, если есть выбранные дочерние файлы
          const hasSelectedFiles = (children) => {
            return children.some(child => {
              if (child.type === 'file' && child.selected && !child.error) {
                return true;
              }
              if (child.type === 'directory' && child.children) {
                return hasSelectedFiles(child.children);
              }
              return false;
            });
          };
          
          if (!shouldIgnore) {
            projectFile.selected = hasSelectedFiles(children);
          }
        }
      } catch (error) {
        projectFile.error = true;
        projectFile.errorMessage = `Cannot read directory: ${error.message}`;
        projectFile.selected = false;
      }
    }
    
    return projectFile;
  } catch (error) {
    console.error(`[Project Tree] Error processing ${dirPath}:`, error.message);
    
    const name = path.basename(dirPath);
    const relativePath = './' + path.relative(rootPath, dirPath).replace(/\\/g, '/');
    
    return {
      path: relativePath,
      name: name,
      type: 'file', // Предполагаем файл при ошибке
      size: 0,
      selected: false,
      error: true,
      errorMessage: error.message
    };
  }
};

// GET /api/project/tree - получить дерево файлов проекта (v2.1.1)
app.get('/api/project/tree', (req, res) => {
  try {
    const rootPath = req.query.rootPath;
    const depth = parseInt(req.query.depth) || 12;
    
    // Валидация обязательного параметра rootPath
    if (!rootPath || typeof rootPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'rootPath query parameter is required and must be an absolute path'
      });
    }
    
    // Валидация глубины
    if (depth < 1 || depth > 20) {
      return res.status(400).json({
        success: false,
        error: 'depth must be between 1 and 20'
      });
    }
    
    // Очистка кавычек из пути
    const cleanRootPath = rootPath.replace(/^["']|["']$/g, '');
    
    console.log(`[Project Tree API] GET /api/project/tree - rootPath: ${cleanRootPath}, depth: ${depth}`);
    
    // Проверяем существование пути
    if (!fs.existsSync(cleanRootPath)) {
      console.error(`[Project Tree API] Directory not found: ${cleanRootPath}`);
      return res.status(400).json({ 
        success: false,
        error: `Directory not found: ${cleanRootPath}. Please check the path on the server.` 
      });
    }
    
    // Используем includeMask из текущей конфигурации KB
    let includePatterns = [];
    if (currentKbConfig.includeMask) {
      includePatterns = currentKbConfig.includeMask
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
    }
    
    // Используем ignorePatterns из текущей конфигурации KB
    let ignorePatterns = [];
    if (currentKbConfig.ignorePatterns) {
      ignorePatterns = currentKbConfig.ignorePatterns
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
    }
    
    // Используем fileSelection из текущей конфигурации KB
    const fileSelection = Array.isArray(currentKbConfig.fileSelection) ? currentKbConfig.fileSelection : [];
    
    // Определяем режим работы
    const mode = fileSelection.length > 0 ? 'fileSelection (точный выбор)' : 'includeMask (glob-маски)';
    console.log(`[Project Tree API] Mode: ${mode}`);
    console.log(`[Project Tree API] Include patterns: ${includePatterns.join(', ') || 'none'}`);
    console.log(`[Project Tree API] Ignore patterns: ${ignorePatterns.join(', ') || 'none'}`);
    if (fileSelection.length > 0) {
      console.log(`[Project Tree API] File selection: ${fileSelection.length} files`);
    }
    
    // Генерируем дерево проекта
    const tree = getProjectTree(cleanRootPath, cleanRootPath, depth, 0, includePatterns, ignorePatterns, fileSelection);
    
    if (!tree) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate project tree'
      });
    }
    
    // Возвращаем массив с корневым элементом (как в старом API для совместимости UI)
    res.json([tree]);
    
    console.log(`[Project Tree API] Successfully generated project tree for: ${cleanRootPath}`);
  } catch (error) {
    console.error(`[Project Tree API] Failed to generate project tree:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate project tree: ' + error.message
    });
  }
});

// POST /api/project/selection - сохранить точную выборку файлов (v2.1.1)
app.post('/api/project/selection', (req, res) => {
  try {
    console.log('[Project Selection API] POST /api/project/selection - Saving file selection');
    
    const { rootPath, files } = req.body;
    
    // Валидация обязательных полей
    if (!rootPath || typeof rootPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'rootPath is required and must be an absolute path string'
      });
    }
    
    if (!Array.isArray(files)) {
      return res.status(400).json({
        success: false,
        error: 'files is required and must be an array of relative paths'
      });
    }
    
    // Очищаем rootPath от кавычек
    const cleanRootPath = rootPath.trim().replace(/^["']|["']$/g, '');
    
    // Проверяем существование корневого пути
    if (!fs.existsSync(cleanRootPath)) {
      return res.status(400).json({
        success: false,
        error: `Root path does not exist on server: ${cleanRootPath}`
      });
    }
    
    // Валидация путей файлов
    const invalidFiles = [];
    const validFiles = [];
    
    for (const file of files) {
      if (typeof file !== 'string') {
        invalidFiles.push(`${file} (not a string)`);
        continue;
      }
      
      if (!file.startsWith('./')) {
        invalidFiles.push(`${file} (must start with './')`);
        continue;
      }
      
      // Проверяем, что файл существует относительно rootPath
      const absoluteFilePath = path.resolve(cleanRootPath, file);
      try {
        if (fs.existsSync(absoluteFilePath)) {
          const stats = fs.statSync(absoluteFilePath);
          if (stats.isFile()) {
            validFiles.push(file);
          } else {
            console.warn(`[Project Selection API] Skipping directory: ${file}`);
          }
        } else {
          console.warn(`[Project Selection API] File does not exist: ${file} (${absoluteFilePath})`);
          // Не добавляем в invalidFiles, так как файл мог быть удален после сканирования
        }
      } catch (error) {
        console.warn(`[Project Selection API] Cannot access file: ${file} - ${error.message}`);
      }
    }
    
    if (invalidFiles.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid file paths: ${invalidFiles.join(', ')}`
      });
    }
    
    // Обновляем конфигурацию KB
    currentKbConfig.rootPath = cleanRootPath;
    currentKbConfig.fileSelection = validFiles;
    
    // Автоматически обновляем lastUpdated
    currentKbConfig.lastUpdated = new Date().toISOString();
    
    // Сохраняем конфигурацию
    saveKbConfig();
    
    console.log(`[Project Selection API] File selection saved:`, {
      rootPath: cleanRootPath,
      selectedFiles: validFiles.length,
      totalRequested: files.length,
      skipped: files.length - validFiles.length
    });
    
    // Возвращаем успешный ответ с обновленной конфигурацией
    res.json({
      success: true,
      message: `Successfully saved selection of ${validFiles.length} files`,
      config: currentKbConfig
    });
  } catch (error) {
    console.error('[Project Selection API] Failed to save file selection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save file selection: ' + error.message
    });
  }
});

// --- END NEW API ENDPOINTS ---

const getFileTree = (dirPath, includePatterns = [], ignorePatterns = [], rootPath = null) => {
  try {
    // Relaxed path check: Just warn in logs if path looks suspicious but try anyway
    if (os.platform() !== 'win32' && dirPath.includes(':')) {
       console.warn(`Attempting to access Windows-style path '${dirPath}' on ${os.platform()} environment. This may fail.`);
    }

    if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory not found: ${dirPath}. (If you are on Linux/Cloud, 'C:/' is not accessible).`);
    }

    // Устанавливаем rootPath при первом вызове для относительных путей
    if (rootPath === null) {
      rootPath = dirPath;
    }

    const stats = fs.statSync(dirPath);
    const name = path.basename(dirPath);
    
    // Получаем относительный путь от корня для проверки паттернов
    const relativePath = path.relative(rootPath, dirPath).replace(/\\/g, '/');
    const normalizedPath = relativePath || '.';
    
    // Функция проверки соответствия паттернам
    const matchesInclude = (filePath) => {
      if (!includePatterns || includePatterns.length === 0) {
        return true; // Если паттернов нет, показываем все
      }
      return includePatterns.some(pattern => minimatch(filePath, pattern, { dot: true }));
    };

    const matchesIgnore = (filePath) => {
      if (!ignorePatterns || ignorePatterns.length === 0) {
        return false; // Если паттернов нет, ничего не игнорируем
      }
      return ignorePatterns.some(pattern => minimatch(filePath, pattern, { dot: true }));
    };

    // Проверяем, нужно ли исключить этот элемент
    const shouldIgnore = matchesIgnore(normalizedPath) || matchesIgnore(name);
    
    // Для файлов: проверяем include и ignore паттерны
    let isChecked = true;
    if (stats.isFile()) {
      if (shouldIgnore || !matchesInclude(normalizedPath)) {
        isChecked = false;
      }
    }

    const node = {
        id: dirPath, 
        name: name,
        type: stats.isDirectory() ? 'folder' : 'file',
        checked: isChecked
    };

    if (stats.isDirectory()) {
        const items = fs.readdirSync(dirPath);
        // Базовые игнорируемые папки
        const baseIgnored = ['node_modules', '.git', '.idea', '__pycache__', 'dist', 'build', '.vscode', '.cursor', 'coverage', '.DS_Store'];
        
        // Фильтруем элементы: убираем базовые игнорируемые и те, что соответствуют ignore паттернам
        const filtered = items.filter(item => {
          if (baseIgnored.includes(item)) return false;
          
          const itemPath = path.join(dirPath, item);
          const itemRelativePath = path.relative(rootPath, itemPath).replace(/\\/g, '/');
          
          // Исключаем если соответствует ignore паттерну
          if (matchesIgnore(itemRelativePath) || matchesIgnore(item)) {
            return false;
          }
          
          return true;
        });
        
        // Рекурсивно обрабатываем дочерние элементы
        node.children = filtered.map(child => {
            return getFileTree(path.join(dirPath, child), includePatterns, ignorePatterns, rootPath);
        }).filter(child => child !== null); // Убираем null элементы
        
        // Если папка пустая или все дети были исключены, она может не показываться
        // Но мы показываем папки, даже если они пустые
    }
    
    // Для папок: проверяем, есть ли внутри файлы, соответствующие include паттернам
    if (stats.isDirectory() && node.children) {
      const hasIncludedFiles = (children) => {
        for (const child of children) {
          if (child.type === 'file' && child.checked) {
            return true;
          }
          if (child.type === 'folder' && child.children && hasIncludedFiles(child.children)) {
            return true;
          }
        }
        return false;
      };
      
      // Если папка соответствует ignore паттерну, отмечаем её и все дети как не выбранные
      if (shouldIgnore) {
        node.checked = false;
        const markUnchecked = (children) => {
          for (const child of children) {
            child.checked = false;
            if (child.children) {
              markUnchecked(child.children);
            }
          }
        };
        markUnchecked(node.children);
      } else {
        // Папка отмечена, если внутри есть выбранные файлы
        node.checked = hasIncludedFiles(node.children);
      }
    }
    
    return node;
  } catch (e) {
    console.error(`[FS Error] ${dirPath}:`, e.message);
    return { 
        id: dirPath, 
        name: dirPath.split(/[/\\]/).pop() || dirPath, 
        type: 'file', 
        error: true, 
        errorMessage: e.message,
        checked: false
    };
  }
};

// DEPRECATED: Use /api/project/tree instead
app.get('/api/files', (req, res) => {
  try {
    console.warn('[DEPRECATED] GET /api/files is deprecated. Use GET /api/project/tree instead.');
    
    // Используем путь из запроса или сохраненный в конфигурации KB
    let targetPath = req.query.path || currentKbConfig.targetPath;
    
    // Если и в конфигурации нет пути, используем PROJECT_ROOT
    if (!targetPath || targetPath === './') {
      targetPath = PROJECT_ROOT;
    }
    
    // Clean up quotes
    targetPath = targetPath.replace(/^["']|["']$/g, '');

    // Проверяем существование пути ДО вызова getFileTree
    if (!fs.existsSync(targetPath)) {
      console.error(`[API Error] Directory not found: ${targetPath}`);
      return res.status(400).json({ 
        success: false,
        error: `Directory not found: ${targetPath}. Please check KB configuration or provide a valid path.` 
      });
    }

    // Парсим паттерны из query параметров или используем сохраненные настройки KB
    let includePatterns = [];
    let ignorePatterns = [];
    
    if (req.query.include) {
      includePatterns = req.query.include
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
    } else if (currentKbConfig.includeMask) {
      // Используем сохраненную маску включения
      includePatterns = currentKbConfig.includeMask
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
    }
    
    if (req.query.ignore) {
      ignorePatterns = req.query.ignore
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
    } else if (currentKbConfig.ignorePatterns) {
      // Используем сохраненные паттерны игнорирования
      ignorePatterns = currentKbConfig.ignorePatterns
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
    }

    const source = req.query.include || req.query.ignore ? 'query params' : 'KB config';
    console.log(`[Scan Request] Path: ${targetPath}, Include: ${includePatterns.join(', ') || 'all'}, Ignore: ${ignorePatterns.join(', ') || 'none'} (${source})`);
    
    const tree = getFileTree(targetPath, includePatterns, ignorePatterns);
    res.json([tree]);
  } catch (error) {
    console.error(`[Fatal API Error]`, error);
    // Если ошибка связана с путем, возвращаем 400, иначе 500
    if (error.message && error.message.includes('Directory not found')) {
      res.status(400).json({ success: false, error: error.message });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

app.use('/api/*', (req, res) => {
    console.error(`[404] API Route not found: ${req.originalUrl}`);
    res.status(404).json({ error: `API endpoint not found: ${req.originalUrl}` });
});

app.use(express.static(path.join(__dirname, '../'), {
    extensions: ['html', 'js', 'ts', 'tsx', 'css', 'json'],
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Initialize Gemini and start server
async function startServer() {
  await initializeGemini();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📂 Default Root: ${PROJECT_ROOT}`);
  });
}

startServer().catch(console.error);