import { EventEmitter } from 'events';
import { errorHandler } from '../ErrorHandler.js';

/**
 * Семантическое обогащение через LLM с batch обработкой и retry логикой
 */
export class SemanticEnricher extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.llmModel = config.llmModel || 'gemini-2.5-flash';
    this.maxRetries = config.maxRetries || 3;
    this.batchSize = config.batchSize || 5;
    this.rateLimitDelay = config.rateLimitDelay || 1000; // 1 секунда между запросами
    this.geminiClient = null;
    
    // Кэш для избежания повторных вызовов
    this.cache = new Map();
    this.requestHistory = []; // Для отслеживания rate limits
  }

  /**
   * Инициализация Gemini клиента
   */
  async initialize() {
    if (!this.geminiClient) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
          throw new Error('API_KEY environment variable is required for semantic enrichment');
        }
        
        this.geminiClient = new GoogleGenAI({ apiKey });
        console.log('Gemini client initialized for semantic enrichment');
      } catch (error) {
        throw new Error(`Failed to initialize Gemini client: ${error.message}`);
      }
    }
  }

  /**
   * Обогатить batch элементов
   */
  async enrichBatch(aiItems) {
    await this.initialize();
    
    const results = [];
    
    for (const item of aiItems) {
      try {
        const enrichedItem = await this.enrichSingleItem(item);
        results.push(enrichedItem);
        
        // Пауза между элементами для соблюдения rate limits
        await this.respectRateLimit();
        
      } catch (error) {
        console.warn(`Failed to enrich item ${item.id}: ${error.message}`);
        
        // Возвращаем базовое обогащение при ошибке
        results.push(this.createFallbackEnrichment(item, error));
      }
    }
    
    return results;
  }

  /**
   * Обогатить отдельный элемент с retry логикой
   */
  async enrichSingleItem(item) {
    const cacheKey = this.createCacheKey(item);
    
    // Проверяем кэш
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.callLLMForEnrichment(item);
        
        // Кэшируем успешный результат
        this.cache.set(cacheKey, result);
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Обрабатываем ошибку через ErrorHandler
        const errorEntry = errorHandler.handleError(error, {
          step: 'enrichment',
          itemId: item.id,
          attempt,
          maxRetries: this.maxRetries
        });
        
        const strategy = errorHandler.getRecoveryStrategy(errorEntry);
        const recovery = await errorHandler.executeRecoveryStrategy(strategy, { retryCount: attempt - 1 });
        
        if (!recovery.shouldRetry || attempt === this.maxRetries) {
          throw error;
        }
        
        console.log(`Retrying enrichment for ${item.id}, attempt ${attempt + 1}/${this.maxRetries}`);
      }
    }
    
    throw lastError;
  }

  /**
   * Вызов LLM для обогащения
   */
  async callLLMForEnrichment(item) {
    const prompt = this.constructPrompt(item);
    
    try {
      const response = await this.geminiClient.models.generateContent({
        model: this.llmModel,
        contents: prompt,
        config: {
          systemInstruction: this.getSystemInstruction(),
          temperature: 0.3, // Низкая температура для более консистентных результатов
          maxOutputTokens: 300, // Ограничиваем длину ответа
        }
      });

      const enrichment = this.parseResponse(response.text, item);
      
      // Записываем в историю запросов для мониторинга
      this.recordRequest(true);
      
      return enrichment;
      
    } catch (error) {
      this.recordRequest(false, error);
      throw error;
    }
  }

  /**
   * Создать промпт для LLM
   */
  constructPrompt(item) {
    const contextInfo = this.buildContextInfo(item);
    
    return `Analyze this ${item.language} code element and provide a structured description:

${contextInfo}

CODE:
\`\`\`${item.language}
${item.l0_code}
\`\`\`

Please provide:
1. DESCRIPTION: A concise, technical description of what this code does (1-2 sentences)
2. PURPOSE: The main purpose/responsibility of this element (1 sentence) 
3. TAGS: 3-5 relevant technical tags (comma-separated)
4. COMPLEXITY: Rate complexity as "low", "medium", or "high"

Format your response as JSON:
{
  "description": "...",
  "purpose": "...", 
  "tags": ["tag1", "tag2", "tag3"],
  "complexity": "medium"
}`;
  }

  /**
   * Построить контекстную информацию
   */
  buildContextInfo(item) {
    let context = `ELEMENT: ${item.id} (${item.type} in ${item.language})`;
    
    if (item.filePath) {
      context += `\nFILE: ${item.filePath}`;
    }
    
    if (item.metadata) {
      const metadata = item.metadata;
      
      // Добавляем релевантную метаинформацию в зависимости от языка
      if (item.language === 'python') {
        if (metadata.isAsync) context += '\nNOTE: This is an async function';
        if (metadata.decorators?.length) context += `\nDECORATORS: ${metadata.decorators.join(', ')}`;
      } else if (item.language === 'java') {
        if (metadata.modifiers?.length) context += `\nMODIFIERS: ${metadata.modifiers.join(' ')}`;
        if (metadata.returnType) context += `\nRETURN TYPE: ${metadata.returnType}`;
      } else if (item.language === 'go') {
        if (metadata.isExported) context += '\nNOTE: This is an exported element';
        if (metadata.receiverType) context += `\nRECEIVER: ${metadata.receiverType}`;
      } else if (item.language === 'typescript') {
        if (metadata.isAsync) context += '\nNOTE: This is an async function';
        if (metadata.returnType) context += `\nRETURN TYPE: ${metadata.returnType}`;
      }
      
      // Параметры для функций и методов
      if ((item.type === 'function' || item.type === 'method') && metadata.parameters?.length) {
        const paramStr = metadata.parameters
          .map(p => p.type ? `${p.name}: ${p.type}` : p.name)
          .join(', ');
        context += `\nPARAMETERS: ${paramStr}`;
      }
    }
    
    return context;
  }

  /**
   * Получить системную инструкцию
   */
  getSystemInstruction() {
    return `You are an expert code analyst specializing in software architecture documentation. 

Your task is to analyze code elements and provide concise, technical descriptions that help developers understand:
- What the code does functionally
- Its role in the larger system
- Its technical characteristics

Guidelines:
- Be precise and technical, not verbose
- Focus on functionality and purpose, not implementation details
- Use standard software engineering terminology
- Keep descriptions under 50 words
- Assign appropriate technical tags
- Rate complexity based on algorithm complexity, dependencies, and maintainability

Always respond with valid JSON in the specified format.`;
  }

  /**
   * Парсить ответ от LLM
   */
  parseResponse(responseText, item) {
    try {
      // Извлекаем JSON из ответа
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Валидируем структуру ответа
      if (!parsed.description || !parsed.purpose) {
        throw new Error('Missing required fields in response');
      }
      
      return {
        description: this.sanitizeText(parsed.description),
        summary: this.sanitizeText(parsed.purpose),
        tags: Array.isArray(parsed.tags) ? parsed.tags.map(tag => this.sanitizeText(tag)) : [],
        complexity: ['low', 'medium', 'high'].includes(parsed.complexity) ? parsed.complexity : 'medium',
        confidence: this.calculateConfidence(parsed, responseText),
        generatedAt: Date.now()
      };
      
    } catch (error) {
      console.warn(`Failed to parse LLM response for ${item.id}: ${error.message}`);
      
      // Fallback парсинг
      return this.extractFallbackEnrichment(responseText, item);
    }
  }

  /**
   * Создать fallback обогащение при ошибке
   */
  createFallbackEnrichment(item, error) {
    return {
      description: `${item.type} ${item.id} - Error during enrichment: ${error.message}`,
      summary: `Failed to analyze ${item.type}`,
      tags: [item.type, item.language, 'parsing-error'],
      complexity: 'unknown',
      confidence: 0,
      generatedAt: Date.now(),
      error: error.message
    };
  }

  /**
   * Извлечь fallback обогащение из неструктурированного ответа
   */
  extractFallbackEnrichment(responseText, item) {
    // Простая эвристика для извлечения описания
    const lines = responseText.split('\n').map(line => line.trim()).filter(line => line);
    
    let description = `${item.type} in ${item.language}`;
    if (lines.length > 0) {
      description = lines[0].substring(0, 100); // Первая строка, не более 100 символов
    }
    
    return {
      description: this.sanitizeText(description),
      summary: `${item.type} requiring manual review`,
      tags: [item.type, item.language, 'manual-review'],
      complexity: 'medium',
      confidence: 0.3,
      generatedAt: Date.now(),
      fallback: true
    };
  }

  /**
   * Очистить текст от нежелательных символов
   */
  sanitizeText(text) {
    if (typeof text !== 'string') return '';
    
    return text
      .replace(/[^\w\s.,!?()-]/g, '') // Убираем специальные символы
      .replace(/\s+/g, ' ') // Нормализуем пробелы
      .trim()
      .substring(0, 200); // Ограничиваем длину
  }

  /**
   * Вычислить уверенность в результате
   */
  calculateConfidence(parsed, fullResponse) {
    let confidence = 0.8; // Базовая уверенность
    
    // Снижаем если ответ слишком короткий или слишком общий
    if (parsed.description.length < 20) confidence -= 0.2;
    if (parsed.description.includes('this code') || parsed.description.includes('this function')) confidence -= 0.1;
    
    // Повышаем если есть технические детали
    if (parsed.tags && parsed.tags.length >= 3) confidence += 0.1;
    if (fullResponse.includes('algorithm') || fullResponse.includes('pattern')) confidence += 0.1;
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Создать ключ для кэширования
   */
  createCacheKey(item) {
    // Создаем хэш на основе кода и метаданных
    const content = item.l0_code + JSON.stringify(item.metadata || {});
    return `${item.language}_${item.type}_${this.simpleHash(content)}`;
  }

  /**
   * Простая хэш функция
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Преобразуем в 32-битное число
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Соблюдать rate limits
   */
  async respectRateLimit() {
    const now = Date.now();
    const recentRequests = this.requestHistory.filter(req => now - req.timestamp < 60000); // Последняя минута
    
    if (recentRequests.length >= 50) { // Лимит: 50 запросов в минуту
      const waitTime = 60000 - (now - recentRequests[0].timestamp);
      console.log(`Rate limit reached, waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Базовая задержка между запросами
    await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
  }

  /**
   * Записать запрос в историю
   */
  recordRequest(success, error = null) {
    this.requestHistory.push({
      timestamp: Date.now(),
      success,
      error: error?.message || null
    });
    
    // Ограничиваем размер истории
    if (this.requestHistory.length > 1000) {
      this.requestHistory = this.requestHistory.slice(-500);
    }
  }

  /**
   * Получить статистику обогащения
   */
  getEnrichmentStats() {
    const now = Date.now();
    const recentRequests = this.requestHistory.filter(req => now - req.timestamp < 3600000); // Последний час
    
    const successful = recentRequests.filter(req => req.success).length;
    const failed = recentRequests.filter(req => !req.success).length;
    
    return {
      totalRequests: recentRequests.length,
      successfulRequests: successful,
      failedRequests: failed,
      successRate: recentRequests.length > 0 ? (successful / recentRequests.length) : 0,
      cacheSize: this.cache.size,
      averageRequestsPerMinute: recentRequests.length / Math.max(1, (now - (recentRequests[0]?.timestamp || now)) / 60000)
    };
  }

  /**
   * Очистить кэш и историю
   */
  clearCache() {
    this.cache.clear();
    this.requestHistory = [];
  }

  /**
   * Экспорт кэша для сохранения
   */
  exportCache() {
    return Array.from(this.cache.entries());
  }

  /**
   * Импорт кэша
   */
  importCache(cacheData) {
    this.cache = new Map(cacheData);
  }
}
