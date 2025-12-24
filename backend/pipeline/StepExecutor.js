import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

/**
 * Исполнитель отдельных шагов pipeline
 */
export class StepExecutor extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
  }

  /**
   * Шаг 1: Polyglot Parsing (L0)
   * Парсинг AST для файлов разных языков
   */
  async executeParsing(previousResults = {}) {
    this.emitProgress(0, 'Starting polyglot parsing...');

    try {
      const { Parser } = await import('./parsers/index.js');
      const parser = new Parser(this.config);

      // Найти все файлы для парсинга
      const files = await this.findSourceFiles();
      this.emitProgress(10, `Found ${files.length} source files`);

      const aiItems = [];
      let processed = 0;

      // Парсим файлы по очереди
      for (const filePath of files) {
        try {
          const items = await parser.parseFile(filePath);
          aiItems.push(...items);
          
          processed++;
          const progress = 10 + Math.floor((processed / files.length) * 80);
          this.emitProgress(progress, `Parsed ${path.basename(filePath)} (${items.length} items)`, processed, files.length);
          
        } catch (error) {
          console.warn(`Failed to parse ${filePath}: ${error.message}`);
          // Продолжаем с другими файлами
        }
      }

      this.emitProgress(100, `Parsing completed: ${aiItems.length} items extracted`);

      return {
        aiItems,
        totalItems: aiItems.length,
        filesProcessed: processed,
        totalFiles: files.length,
        timestamp: Date.now()
      };

    } catch (error) {
      throw new Error(`Parsing failed: ${error.message}`);
    }
  }

  /**
   * Шаг 2: Dependency Analysis (L1)
   * Анализ зависимостей между элементами кода
   */
  async executeDependencyAnalysis(previousResults) {
    this.emitProgress(0, 'Starting dependency analysis...');

    if (!previousResults.parsing?.aiItems) {
      throw new Error('No parsed items found from previous step');
    }

    try {
      const { DependencyAnalyzer } = await import('./analyzers/DependencyAnalyzer.js');
      const analyzer = new DependencyAnalyzer(this.config);

      const aiItems = [...previousResults.parsing.aiItems];
      let processed = 0;

      this.emitProgress(10, 'Analyzing imports and references...');

      // Анализируем зависимости для каждого элемента
      for (const item of aiItems) {
        try {
          const dependencies = await analyzer.analyzeDependencies(item, aiItems);
          item.l1_deps = dependencies;
          
          processed++;
          const progress = 10 + Math.floor((processed / aiItems.length) * 80);
          this.emitProgress(progress, `Analyzed dependencies for ${item.id}`, processed, aiItems.length);
          
        } catch (error) {
          console.warn(`Failed to analyze dependencies for ${item.id}: ${error.message}`);
          item.l1_deps = []; // Пустые зависимости при ошибке
        }
      }

      // Строим граф зависимостей
      this.emitProgress(90, 'Building dependency graph...');
      const graph = analyzer.buildDependencyGraph(aiItems);

      this.emitProgress(100, `Dependency analysis completed: ${aiItems.length} items processed`);

      return {
        aiItems,
        dependencyGraph: graph,
        statistics: {
          totalItems: aiItems.length,
          itemsWithDependencies: aiItems.filter(item => item.l1_deps.length > 0).length,
          totalDependencies: aiItems.reduce((sum, item) => sum + item.l1_deps.length, 0)
        },
        timestamp: Date.now()
      };

    } catch (error) {
      throw new Error(`Dependency analysis failed: ${error.message}`);
    }
  }

  /**
   * Шаг 3: Semantic Enrichment (L2)
   * Генерация семантических описаний через LLM
   */
  async executeSemanticEnrichment(previousResults) {
    this.emitProgress(0, 'Starting semantic enrichment...');

    if (!previousResults.dependencies?.aiItems) {
      throw new Error('No items with dependencies found from previous step');
    }

    try {
      const { SemanticEnricher } = await import('./enrichers/SemanticEnricher.js');
      const enricher = new SemanticEnricher(this.config);

      const aiItems = [...previousResults.dependencies.aiItems];
      let processed = 0;

      // Batch обработка для эффективности
      const batchSize = 5; // Обрабатываем по 5 элементов за раз
      const batches = this.createBatches(aiItems, batchSize);

      this.emitProgress(10, `Processing ${batches.length} batches for semantic enrichment...`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        try {
          // Обогащаем batch элементов
          const enrichedBatch = await enricher.enrichBatch(batch);
          
          // Обновляем элементы
          enrichedBatch.forEach((enrichedItem, idx) => {
            const originalItem = batch[idx];
            originalItem.l2_desc = enrichedItem.description;
            originalItem.l2_summary = enrichedItem.summary;
            originalItem.l2_tags = enrichedItem.tags;
          });

          processed += batch.length;
          const progress = 10 + Math.floor((processed / aiItems.length) * 80);
          this.emitProgress(progress, `Enriched batch ${i + 1}/${batches.length}`, processed, aiItems.length);

          // Небольшая пауза между batch'ами для API rate limiting
          await this.sleep(100);
          
        } catch (error) {
          console.warn(`Failed to enrich batch ${i}: ${error.message}`);
          // Оставляем пустые описания при ошибке
          batch.forEach(item => {
            if (!item.l2_desc) {
              item.l2_desc = `Error generating description: ${error.message}`;
            }
          });
          processed += batch.length;
        }
      }

      this.emitProgress(100, `Semantic enrichment completed: ${aiItems.length} items processed`);

      return {
        aiItems,
        statistics: {
          totalItems: aiItems.length,
          enrichedItems: aiItems.filter(item => item.l2_desc && !item.l2_desc.startsWith('Error')).length,
          averageDescriptionLength: this.calculateAverageLength(aiItems, 'l2_desc')
        },
        timestamp: Date.now()
      };

    } catch (error) {
      throw new Error(`Semantic enrichment failed: ${error.message}`);
    }
  }

  /**
   * Шаг 4: Vectorization
   * Создание векторных представлений для элементов
   */
  async executeVectorization(previousResults) {
    this.emitProgress(0, 'Starting vectorization...');

    if (!previousResults.enrichment?.aiItems) {
      throw new Error('No enriched items found from previous step');
    }

    try {
      const { Vectorizer } = await import('./vectorizers/Vectorizer.js');
      const vectorizer = new Vectorizer(this.config);

      const aiItems = previousResults.enrichment.aiItems;
      let processed = 0;

      this.emitProgress(10, 'Initializing embedding model...');
      await vectorizer.initialize();

      // Подготавливаем тексты для векторизации
      const texts = aiItems.map(item => {
        return `${item.id}\n${item.l2_desc || ''}\n${item.l0_code || ''}`.trim();
      });

      this.emitProgress(20, `Vectorizing ${texts.length} text chunks...`);

      // Batch векторизация
      const batchSize = 10;
      const batches = this.createBatches(texts, batchSize);
      const allVectors = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        try {
          const vectors = await vectorizer.createEmbeddings(batch);
          allVectors.push(...vectors);
          
          processed += batch.length;
          const progress = 20 + Math.floor((processed / texts.length) * 70);
          this.emitProgress(progress, `Vectorized batch ${i + 1}/${batches.length}`, processed, texts.length);

          // Пауза для API rate limiting
          await this.sleep(200);
          
        } catch (error) {
          console.warn(`Failed to vectorize batch ${i}: ${error.message}`);
          // Создаем пустые векторы при ошибке
          const emptyVectors = Array(batch.length).fill().map(() => new Float32Array(1536));
          allVectors.push(...emptyVectors);
          processed += batch.length;
        }
      }

      // Присваиваем векторы элементам
      aiItems.forEach((item, idx) => {
        item.vector = allVectors[idx];
      });

      this.emitProgress(100, `Vectorization completed: ${allVectors.length} vectors created`);

      return {
        aiItems,
        vectors: allVectors,
        vectorDimension: allVectors[0]?.length || 0,
        statistics: {
          totalItems: aiItems.length,
          vectorizedItems: allVectors.filter(v => v && v.length > 0).length,
          embeddingModel: this.config.embeddingModel
        },
        timestamp: Date.now()
      };

    } catch (error) {
      throw new Error(`Vectorization failed: ${error.message}`);
    }
  }

  /**
   * Шаг 5: Index Construction
   * Построение поискового индекса
   */
  async executeIndexing(previousResults) {
    this.emitProgress(0, 'Starting index construction...');

    if (!previousResults.vectorization?.vectors) {
      throw new Error('No vectors found from previous step');
    }

    try {
      const { IndexBuilder } = await import('./indexers/IndexBuilder.js');
      const indexBuilder = new IndexBuilder(this.config);

      const { vectors, aiItems } = previousResults.vectorization;

      this.emitProgress(10, 'Initializing FAISS index...');
      await indexBuilder.initialize(vectors[0].length);

      this.emitProgress(30, 'Adding vectors to index...');
      
      // Добавляем векторы в индекс batch'ами
      const batchSize = 100;
      const batches = this.createBatches(vectors, batchSize);
      let processed = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const startIdx = i * batchSize;
        
        await indexBuilder.addVectors(batch, startIdx);
        
        processed += batch.length;
        const progress = 30 + Math.floor((processed / vectors.length) * 50);
        this.emitProgress(progress, `Added batch ${i + 1}/${batches.length} to index`, processed, vectors.length);
      }

      this.emitProgress(80, 'Optimizing index...');
      await indexBuilder.optimize();

      this.emitProgress(90, 'Saving index to disk...');
      const indexPath = await indexBuilder.save();

      // Создаем metadata для поиска
      const metadata = aiItems.map((item, idx) => ({
        id: item.id,
        type: item.type,
        language: item.language,
        filePath: item.filePath,
        vectorIndex: idx
      }));

      this.emitProgress(100, `Index construction completed: ${vectors.length} vectors indexed`);

      return {
        indexPath,
        metadata,
        statistics: {
          totalVectors: vectors.length,
          vectorDimension: vectors[0].length,
          indexSize: await this.getIndexSize(indexPath),
          searchReady: true
        },
        timestamp: Date.now()
      };

    } catch (error) {
      throw new Error(`Index construction failed: ${error.message}`);
    }
  }

  /**
   * Найти все исходные файлы для парсинга
   */
  async findSourceFiles() {
    let allFiles = [];

    // Если есть конкретные выбранные файлы - используем их
    if (this.config.selectedFiles && this.config.selectedFiles.length > 0) {
      console.log(`Using ${this.config.selectedFiles.length} specifically selected files`);
      allFiles = [...this.config.selectedFiles];
      
      // Применяем исключения
      if (this.config.excludedFiles && this.config.excludedFiles.length > 0) {
        console.log(`Excluding ${this.config.excludedFiles.length} files from selection`);
        const excludedSet = new Set(this.config.excludedFiles);
        allFiles = allFiles.filter(file => !excludedSet.has(file));
      }
      
    } else {
      // Используем glob паттерны (существующая логика)
      console.log(`Using glob patterns: ${this.config.filePatterns.join(', ')}`);
      const { glob } = await import('glob');
      
      for (const pattern of this.config.filePatterns) {
        const files = await glob(pattern, {
          cwd: this.config.projectPath,
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**']
        });
        allFiles.push(...files);
      }

      // Применяем исключения к результатам glob
      if (this.config.excludedFiles && this.config.excludedFiles.length > 0) {
        console.log(`Excluding ${this.config.excludedFiles.length} files from glob results`);
        const excludedSet = new Set(this.config.excludedFiles);
        allFiles = allFiles.filter(file => !excludedSet.has(file));
      }
    }

    // Убираем дубликаты и проверяем существование файлов
    const uniqueFiles = [...new Set(allFiles)];
    const existingFiles = [];
    
    for (const file of uniqueFiles) {
      try {
        const fs = await import('fs');
        await fs.promises.access(file);
        existingFiles.push(file);
      } catch (error) {
        console.warn(`File not accessible: ${file} - ${error.message}`);
      }
    }
    
    console.log(`Found ${existingFiles.length} accessible files for processing`);
    return existingFiles;
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
   * Отправить событие прогресса
   */
  emitProgress(percentage, message, itemsProcessed = 0, totalItems = 0) {
    this.emit('progress', {
      percentage,
      message,
      itemsProcessed,
      totalItems
    });
  }

  /**
   * Вычислить среднюю длину поля
   */
  calculateAverageLength(items, field) {
    const lengths = items
      .filter(item => item[field])
      .map(item => item[field].length);
    
    return lengths.length > 0 
      ? Math.round(lengths.reduce((sum, len) => sum + len, 0) / lengths.length)
      : 0;
  }

  /**
   * Получить размер индекса на диске
   */
  async getIndexSize(indexPath) {
    try {
      const stats = await fs.stat(indexPath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Пауза
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
