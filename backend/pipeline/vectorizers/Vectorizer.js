import { EventEmitter } from 'events';

/**
 * Векторизатор для создания эмбеддингов из текста
 */
export class Vectorizer extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.embeddingModel = config.embeddingModel || 'text-embedding-ada-002';
    this.maxBatchSize = config.maxBatchSize || 100;
    this.vectorDimension = null;
    this.provider = this.determineProvider();
    this.client = null;
    
    // Кэш для избежания повторных вызовов
    this.cache = new Map();
    this.requestCount = 0;
  }

  /**
   * Определить провайдера эмбеддингов
   */
  determineProvider() {
    if (this.embeddingModel.includes('ada') || this.embeddingModel.includes('text-embedding')) {
      return 'openai';
    } else if (this.embeddingModel.includes('gecko') || this.embeddingModel.includes('embedding-gecko')) {
      return 'google';
    } else {
      return 'local'; // Fallback к локальной модели
    }
  }

  /**
   * Инициализация векторизатора
   */
  async initialize() {
    switch (this.provider) {
      case 'openai':
        await this.initializeOpenAI();
        break;
      case 'google':
        await this.initializeGoogle();
        break;
      case 'local':
        await this.initializeLocal();
        break;
      default:
        throw new Error(`Unknown embedding provider: ${this.provider}`);
    }
    
    console.log(`Vectorizer initialized with ${this.provider} provider (${this.embeddingModel})`);
  }

  /**
   * Инициализация OpenAI
   */
  async initializeOpenAI() {
    try {
      const { OpenAI } = await import('openai');
      
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      
      this.client = new OpenAI({ apiKey });
      this.vectorDimension = 1536; // Ada-002 dimension
      
    } catch (error) {
      console.warn('OpenAI not available, falling back to local vectorizer');
      this.provider = 'local';
      await this.initializeLocal();
    }
  }

  /**
   * Инициализация Google Embeddings
   */
  async initializeGoogle() {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error('API_KEY environment variable is required for Google embeddings');
      }
      
      this.client = new GoogleGenAI({ apiKey });
      this.vectorDimension = 768; // Gecko dimension
      
    } catch (error) {
      console.warn('Google AI not available, falling back to local vectorizer');
      this.provider = 'local';
      await this.initializeLocal();
    }
  }

  /**
   * Инициализация локального векторизатора
   */
  async initializeLocal() {
    // Простой TF-IDF векторизатор как fallback
    this.client = new TFIDFVectorizer();
    this.vectorDimension = 384; // Меньшая размерность для локального
    console.log('Using local TF-IDF vectorizer as fallback');
  }

  /**
   * Создать эмбеддинги для массива текстов
   */
  async createEmbeddings(texts) {
    if (!this.client) {
      throw new Error('Vectorizer not initialized. Call initialize() first.');
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('Texts must be a non-empty array');
    }

    // Обрабатываем по batch'ам
    const batches = this.createBatches(texts, this.maxBatchSize);
    const allVectors = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        const batchVectors = await this.processEmbeddingBatch(batch);
        allVectors.push(...batchVectors);
        
        this.emit('progress', {
          batch: i + 1,
          totalBatches: batches.length,
          processed: allVectors.length,
          total: texts.length
        });
        
        // Пауза между batch'ами для соблюдения rate limits
        if (i < batches.length - 1) {
          await this.sleep(this.getRateLimitDelay());
        }
        
      } catch (error) {
        console.error(`Failed to process batch ${i + 1}: ${error.message}`);
        
        // Создаем пустые векторы для неудачного batch'а
        const emptyVectors = batch.map(() => this.createEmptyVector());
        allVectors.push(...emptyVectors);
      }
    }

    return allVectors;
  }

  /**
   * Обработать один batch эмбеддингов
   */
  async processEmbeddingBatch(texts) {
    const vectors = [];
    
    for (const text of texts) {
      const cacheKey = this.createCacheKey(text);
      
      // Проверяем кэш
      if (this.cache.has(cacheKey)) {
        vectors.push(this.cache.get(cacheKey));
        continue;
      }
      
      try {
        const vector = await this.createSingleEmbedding(text);
        
        // Кэшируем результат
        this.cache.set(cacheKey, vector);
        vectors.push(vector);
        
        this.requestCount++;
        
      } catch (error) {
        console.warn(`Failed to create embedding for text: ${error.message}`);
        vectors.push(this.createEmptyVector());
      }
    }
    
    return vectors;
  }

  /**
   * Создать эмбеддинг для одного текста
   */
  async createSingleEmbedding(text) {
    const cleanText = this.preprocessText(text);
    
    switch (this.provider) {
      case 'openai':
        return this.createOpenAIEmbedding(cleanText);
      case 'google':
        return this.createGoogleEmbedding(cleanText);
      case 'local':
        return this.createLocalEmbedding(cleanText);
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }
  }

  /**
   * Создать OpenAI эмбеддинг
   */
  async createOpenAIEmbedding(text) {
    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });
      
      return new Float32Array(response.data[0].embedding);
      
    } catch (error) {
      if (error.status === 429) { // Rate limit
        throw new Error('OpenAI rate limit exceeded');
      }
      throw error;
    }
  }

  /**
   * Создать Google эмбеддинг
   */
  async createGoogleEmbedding(text) {
    try {
      // Используем Gemini для эмбеддингов (если доступно)
      const response = await this.client.models.embedText({
        model: this.embeddingModel,
        text: text
      });
      
      return new Float32Array(response.embedding);
      
    } catch (error) {
      throw new Error(`Google embedding failed: ${error.message}`);
    }
  }

  /**
   * Создать локальный эмбеддинг (TF-IDF)
   */
  async createLocalEmbedding(text) {
    return this.client.transform(text);
  }

  /**
   * Предобработка текста
   */
  preprocessText(text) {
    if (!text || typeof text !== 'string') {
      return 'empty';
    }
    
    // Очищаем и нормализуем текст
    let cleaned = text
      .toLowerCase()
      .replace(/[^\w\s.-]/g, ' ') // Убираем специальные символы кроме точек и дефисов
      .replace(/\s+/g, ' ') // Нормализуем пробелы
      .trim();
    
    // Ограничиваем длину (важно для API лимитов)
    const maxLength = this.getMaxTextLength();
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength) + '...';
    }
    
    return cleaned || 'empty';
  }

  /**
   * Получить максимальную длину текста для модели
   */
  getMaxTextLength() {
    switch (this.provider) {
      case 'openai':
        return 8000; // Примерно 8k токенов
      case 'google':
        return 6000; // Консервативный лимит
      case 'local':
        return 2000; // Ограничение для локальной модели
      default:
        return 1000;
    }
  }

  /**
   * Создать пустой вектор
   */
  createEmptyVector() {
    return new Float32Array(this.vectorDimension);
  }

  /**
   * Создать ключ для кэширования
   */
  createCacheKey(text) {
    // Простой хэш для кэширования
    return `${this.embeddingModel}_${this.simpleHash(text)}`;
  }

  /**
   * Простая хэш функция
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Создать batch'и из массива
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Получить задержку для rate limiting
   */
  getRateLimitDelay() {
    switch (this.provider) {
      case 'openai':
        return 1000; // 1 секунда между batch'ами
      case 'google':
        return 500; // 0.5 секунды
      case 'local':
        return 100; // Минимальная задержка
      default:
        return 1000;
    }
  }

  /**
   * Пауза
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Получить статистику векторизации
   */
  getVectorizationStats() {
    return {
      provider: this.provider,
      model: this.embeddingModel,
      vectorDimension: this.vectorDimension,
      requestCount: this.requestCount,
      cacheSize: this.cache.size,
      cacheHitRate: this.requestCount > 0 ? this.cache.size / this.requestCount : 0
    };
  }

  /**
   * Очистить кэш
   */
  clearCache() {
    this.cache.clear();
    this.requestCount = 0;
  }
}

/**
 * Простой TF-IDF векторизатор как fallback
 */
class TFIDFVectorizer {
  constructor() {
    this.vocabulary = new Map();
    this.idf = new Map();
    this.vectorDimension = 384;
    this.isInitialized = false;
  }

  /**
   * Инициализация с базовым словарем
   */
  initialize() {
    if (this.isInitialized) return;
    
    // Базовый словарь программистских терминов
    const baseTerms = [
      'function', 'class', 'method', 'variable', 'parameter', 'return', 'import', 'export',
      'interface', 'type', 'struct', 'enum', 'const', 'let', 'var', 'async', 'await',
      'public', 'private', 'protected', 'static', 'abstract', 'final', 'override',
      'constructor', 'destructor', 'getter', 'setter', 'property', 'field', 'attribute',
      'loop', 'condition', 'if', 'else', 'switch', 'case', 'try', 'catch', 'finally',
      'throw', 'exception', 'error', 'handle', 'process', 'execute', 'run', 'call',
      'create', 'initialize', 'configure', 'setup', 'cleanup', 'dispose', 'destroy',
      'data', 'string', 'number', 'boolean', 'array', 'object', 'null', 'undefined',
      'api', 'http', 'request', 'response', 'client', 'server', 'service', 'controller',
      'model', 'view', 'component', 'module', 'library', 'framework', 'utility', 'helper'
    ];
    
    baseTerms.forEach((term, index) => {
      this.vocabulary.set(term, index);
      this.idf.set(term, Math.log(1000 / (index + 1))); // Примерные IDF веса
    });
    
    this.isInitialized = true;
  }

  /**
   * Преобразовать текст в вектор
   */
  transform(text) {
    this.initialize();
    
    const tokens = this.tokenize(text);
    const vector = new Float32Array(this.vectorDimension);
    
    // Подсчет TF
    const termFreq = new Map();
    tokens.forEach(token => {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    });
    
    // Вычисление TF-IDF
    const maxFreq = Math.max(...termFreq.values()) || 1;
    
    for (const [term, freq] of termFreq) {
      const vocabIndex = this.vocabulary.get(term);
      if (vocabIndex !== undefined && vocabIndex < this.vectorDimension) {
        const tf = freq / maxFreq;
        const idf = this.idf.get(term) || 1;
        vector[vocabIndex] = tf * idf;
      }
    }
    
    // Нормализация вектора
    this.normalizeVector(vector);
    
    return vector;
  }

  /**
   * Токенизация текста
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1); // Убираем односимвольные токены
  }

  /**
   * Нормализация вектора (L2 норма)
   */
  normalizeVector(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }
  }
}
