import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Построение поисковых индексов с поддержкой FAISS и ChromaDB
 */
export class IndexBuilder extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.indexType = config.indexType || 'faiss'; // 'faiss' или 'chromadb'
    this.indexPath = config.indexPath || path.join(os.tmpdir(), 'aiitem_index');
    this.vectorDimension = null;
    this.index = null;
    this.metadata = [];
    this.isInitialized = false;
  }

  /**
   * Инициализация индекса
   */
  async initialize(vectorDimension) {
    this.vectorDimension = vectorDimension;
    
    switch (this.indexType) {
      case 'faiss':
        await this.initializeFAISS();
        break;
      case 'chromadb':
        await this.initializeChromaDB();
        break;
      case 'simple':
        await this.initializeSimpleIndex();
        break;
      default:
        throw new Error(`Unknown index type: ${this.indexType}`);
    }
    
    this.isInitialized = true;
    console.log(`Index builder initialized: ${this.indexType} (${vectorDimension}D)`);
  }

  /**
   * Инициализация FAISS индекса
   */
  async initializeFAISS() {
    try {
      const faiss = await import('faiss-node');
      
      // Создаем FAISS индекс (IndexFlatL2 для начала)
      this.index = new faiss.IndexFlatL2(this.vectorDimension);
      
      console.log('FAISS index initialized');
      
    } catch (error) {
      console.warn('FAISS not available, falling back to simple index');
      this.indexType = 'simple';
      await this.initializeSimpleIndex();
    }
  }

  /**
   * Инициализация ChromaDB
   */
  async initializeChromaDB() {
    try {
      const { ChromaClient } = await import('chromadb');
      
      this.client = new ChromaClient({
        path: this.config.chromaPath || 'http://localhost:8000'
      });
      
      // Создаем или получаем коллекцию
      const collectionName = this.config.collectionName || 'aiitem_vectors';
      
      try {
        this.collection = await this.client.getCollection({
          name: collectionName
        });
      } catch (error) {
        // Коллекция не существует, создаем новую
        this.collection = await this.client.createCollection({
          name: collectionName,
          metadata: { dimension: this.vectorDimension }
        });
      }
      
      console.log('ChromaDB initialized');
      
    } catch (error) {
      console.warn('ChromaDB not available, falling back to simple index');
      this.indexType = 'simple';
      await this.initializeSimpleIndex();
    }
  }

  /**
   * Инициализация простого индекса (fallback)
   */
  async initializeSimpleIndex() {
    this.index = new SimpleVectorIndex(this.vectorDimension);
    console.log('Simple vector index initialized');
  }

  /**
   * Добавить векторы в индекс
   */
  async addVectors(vectors, startIndex = 0) {
    if (!this.isInitialized) {
      throw new Error('Index not initialized. Call initialize() first.');
    }

    if (!Array.isArray(vectors) || vectors.length === 0) {
      throw new Error('Vectors must be a non-empty array');
    }

    switch (this.indexType) {
      case 'faiss':
        return this.addVectorsToFAISS(vectors, startIndex);
      case 'chromadb':
        return this.addVectorsToChromaDB(vectors, startIndex);
      case 'simple':
        return this.addVectorsToSimpleIndex(vectors, startIndex);
      default:
        throw new Error(`Unknown index type: ${this.indexType}`);
    }
  }

  /**
   * Добавить векторы в FAISS
   */
  async addVectorsToFAISS(vectors, startIndex) {
    // Подготавливаем данные для FAISS
    const vectorData = new Float32Array(vectors.length * this.vectorDimension);
    
    for (let i = 0; i < vectors.length; i++) {
      const vector = vectors[i];
      if (vector.length !== this.vectorDimension) {
        throw new Error(`Vector ${i} has incorrect dimension: ${vector.length} (expected ${this.vectorDimension})`);
      }
      
      for (let j = 0; j < this.vectorDimension; j++) {
        vectorData[i * this.vectorDimension + j] = vector[j];
      }
    }
    
    // Добавляем в FAISS индекс
    this.index.add(vectorData);
    
    console.log(`Added ${vectors.length} vectors to FAISS index (total: ${this.index.ntotal()})`);
  }

  /**
   * Добавить векторы в ChromaDB
   */
  async addVectorsToChromaDB(vectors, startIndex) {
    // Подготавливаем данные для ChromaDB
    const ids = vectors.map((_, i) => `item_${startIndex + i}`);
    const embeddings = vectors.map(v => Array.from(v));
    
    // Создаем метаданные
    const metadatas = vectors.map((_, i) => ({
      index: startIndex + i,
      dimension: this.vectorDimension,
      added_at: new Date().toISOString()
    }));
    
    await this.collection.add({
      ids,
      embeddings,
      metadatas
    });
    
    console.log(`Added ${vectors.length} vectors to ChromaDB collection`);
  }

  /**
   * Добавить векторы в простой индекс
   */
  async addVectorsToSimpleIndex(vectors, startIndex) {
    for (let i = 0; i < vectors.length; i++) {
      this.index.addVector(vectors[i], startIndex + i);
    }
    
    console.log(`Added ${vectors.length} vectors to simple index`);
  }

  /**
   * Поиск похожих векторов
   */
  async search(queryVector, k = 10) {
    if (!this.isInitialized) {
      throw new Error('Index not initialized');
    }

    switch (this.indexType) {
      case 'faiss':
        return this.searchFAISS(queryVector, k);
      case 'chromadb':
        return this.searchChromaDB(queryVector, k);
      case 'simple':
        return this.searchSimpleIndex(queryVector, k);
      default:
        throw new Error(`Unknown index type: ${this.indexType}`);
    }
  }

  /**
   * Поиск в FAISS
   */
  async searchFAISS(queryVector, k) {
    const results = this.index.search(queryVector, k);
    
    return {
      distances: Array.from(results.distances),
      indices: Array.from(results.labels),
      count: results.labels.length
    };
  }

  /**
   * Поиск в ChromaDB
   */
  async searchChromaDB(queryVector, k) {
    const results = await this.collection.query({
      queryEmbeddings: [Array.from(queryVector)],
      nResults: k
    });
    
    return {
      distances: results.distances[0] || [],
      indices: results.ids[0]?.map(id => parseInt(id.split('_')[1])) || [],
      metadatas: results.metadatas[0] || [],
      count: results.ids[0]?.length || 0
    };
  }

  /**
   * Поиск в простом индексе
   */
  async searchSimpleIndex(queryVector, k) {
    return this.index.search(queryVector, k);
  }

  /**
   * Оптимизация индекса
   */
  async optimize() {
    switch (this.indexType) {
      case 'faiss':
        // FAISS IndexFlatL2 не требует оптимизации
        console.log('FAISS index optimization completed');
        break;
      case 'chromadb':
        // ChromaDB автоматически оптимизируется
        console.log('ChromaDB optimization completed');
        break;
      case 'simple':
        this.index.optimize();
        console.log('Simple index optimization completed');
        break;
    }
  }

  /**
   * Сохранить индекс на диск
   */
  async save() {
    await fs.mkdir(path.dirname(this.indexPath), { recursive: true });
    
    switch (this.indexType) {
      case 'faiss':
        return this.saveFAISSIndex();
      case 'chromadb':
        return this.saveChromaDBIndex();
      case 'simple':
        return this.saveSimpleIndex();
      default:
        throw new Error(`Cannot save index of type: ${this.indexType}`);
    }
  }

  /**
   * Сохранить FAISS индекс
   */
  async saveFAISSIndex() {
    const indexFile = `${this.indexPath}.faiss`;
    
    // Сохраняем FAISS индекс
    this.index.write(indexFile);
    
    // Сохраняем метаданные
    const metadataFile = `${this.indexPath}.metadata.json`;
    await fs.writeFile(metadataFile, JSON.stringify({
      indexType: 'faiss',
      vectorDimension: this.vectorDimension,
      totalVectors: this.index.ntotal(),
      createdAt: new Date().toISOString()
    }, null, 2));
    
    console.log(`FAISS index saved to ${indexFile}`);
    return indexFile;
  }

  /**
   * Сохранить ChromaDB индекс
   */
  async saveChromaDBIndex() {
    // ChromaDB сохраняется автоматически
    const metadataFile = `${this.indexPath}.chromadb.json`;
    
    const count = await this.collection.count();
    
    await fs.writeFile(metadataFile, JSON.stringify({
      indexType: 'chromadb',
      vectorDimension: this.vectorDimension,
      totalVectors: count,
      collectionName: this.collection.name,
      createdAt: new Date().toISOString()
    }, null, 2));
    
    console.log(`ChromaDB metadata saved to ${metadataFile}`);
    return metadataFile;
  }

  /**
   * Сохранить простой индекс
   */
  async saveSimpleIndex() {
    const indexFile = `${this.indexPath}.simple.json`;
    
    await fs.writeFile(indexFile, JSON.stringify({
      indexType: 'simple',
      vectorDimension: this.vectorDimension,
      vectors: this.index.serialize(),
      createdAt: new Date().toISOString()
    }, null, 2));
    
    console.log(`Simple index saved to ${indexFile}`);
    return indexFile;
  }

  /**
   * Загрузить индекс с диска
   */
  async load(indexFile) {
    if (indexFile.endsWith('.faiss')) {
      await this.loadFAISSIndex(indexFile);
    } else if (indexFile.includes('.chromadb.')) {
      await this.loadChromaDBIndex(indexFile);
    } else if (indexFile.endsWith('.simple.json')) {
      await this.loadSimpleIndex(indexFile);
    } else {
      throw new Error(`Unknown index file format: ${indexFile}`);
    }
    
    this.isInitialized = true;
  }

  /**
   * Загрузить FAISS индекс
   */
  async loadFAISSIndex(indexFile) {
    const faiss = await import('faiss-node');
    
    this.index = faiss.read_index(indexFile);
    this.indexType = 'faiss';
    
    // Загружаем метаданные
    const metadataFile = indexFile.replace('.faiss', '.metadata.json');
    try {
      const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf-8'));
      this.vectorDimension = metadata.vectorDimension;
    } catch (error) {
      console.warn('Could not load FAISS metadata, using defaults');
    }
    
    console.log(`FAISS index loaded from ${indexFile}`);
  }

  /**
   * Загрузить ChromaDB индекс
   */
  async loadChromaDBIndex(metadataFile) {
    const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf-8'));
    
    this.indexType = 'chromadb';
    this.vectorDimension = metadata.vectorDimension;
    
    await this.initializeChromaDB();
    
    console.log(`ChromaDB index loaded from metadata`);
  }

  /**
   * Загрузить простой индекс
   */
  async loadSimpleIndex(indexFile) {
    const data = JSON.parse(await fs.readFile(indexFile, 'utf-8'));
    
    this.indexType = 'simple';
    this.vectorDimension = data.vectorDimension;
    
    this.index = new SimpleVectorIndex(this.vectorDimension);
    this.index.deserialize(data.vectors);
    
    console.log(`Simple index loaded from ${indexFile}`);
  }

  /**
   * Получить информацию об индексе
   */
  getIndexInfo() {
    if (!this.isInitialized) {
      return { initialized: false };
    }

    const baseInfo = {
      initialized: true,
      type: this.indexType,
      vectorDimension: this.vectorDimension,
      indexPath: this.indexPath
    };

    switch (this.indexType) {
      case 'faiss':
        return {
          ...baseInfo,
          totalVectors: this.index.ntotal(),
          isTrained: this.index.is_trained
        };
      case 'chromadb':
        return {
          ...baseInfo,
          collectionName: this.collection?.name,
          // Note: Async count would need to be called separately
        };
      case 'simple':
        return {
          ...baseInfo,
          totalVectors: this.index.getSize()
        };
      default:
        return baseInfo;
    }
  }
}

/**
 * Простой векторный индекс как fallback
 */
class SimpleVectorIndex {
  constructor(dimension) {
    this.dimension = dimension;
    this.vectors = [];
    this.indices = [];
  }

  addVector(vector, index) {
    this.vectors.push(Array.from(vector));
    this.indices.push(index);
  }

  search(queryVector, k = 10) {
    if (this.vectors.length === 0) {
      return { distances: [], indices: [], count: 0 };
    }

    // Вычисляем cosine similarity со всеми векторами
    const similarities = this.vectors.map((vector, i) => ({
      similarity: this.cosineSimilarity(queryVector, vector),
      index: this.indices[i],
      vectorIndex: i
    }));

    // Сортируем по убыванию similarity
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Берем топ-k результатов
    const topK = similarities.slice(0, Math.min(k, similarities.length));

    return {
      distances: topK.map(item => 1 - item.similarity), // Преобразуем в distances
      indices: topK.map(item => item.index),
      count: topK.length
    };
  }

  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  optimize() {
    // Для простого индекса оптимизация не требуется
  }

  getSize() {
    return this.vectors.length;
  }

  serialize() {
    return {
      dimension: this.dimension,
      vectors: this.vectors,
      indices: this.indices
    };
  }

  deserialize(data) {
    this.dimension = data.dimension;
    this.vectors = data.vectors || [];
    this.indices = data.indices || [];
  }
}
