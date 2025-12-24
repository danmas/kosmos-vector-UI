import fs from 'fs/promises';
import path from 'path';

/**
 * Базовый класс для всех парсеров
 */
export class BaseParser {
  constructor(config) {
    this.config = config;
  }

  /**
   * Парсинг файла (должен быть переопределен в наследниках)
   */
  async parseFile(filePath) {
    throw new Error('parseFile method must be implemented by subclass');
  }

  /**
   * Прочитать содержимое файла
   */
  async readFile(filePath) {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Cannot read file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Создать базовый AiItem
   */
  createAiItem(id, type, language, filePath, sourceCode, startLine = 1, endLine = 1) {
    return {
      id,
      type,
      language,
      filePath: path.relative(this.config.projectPath || process.cwd(), filePath),
      l0_code: sourceCode.trim(),
      l1_deps: [], // Будет заполнено на этапе анализа зависимостей
      l2_desc: null, // Будет заполнено на этапе семантического обогащения
      metadata: {
        startLine,
        endLine,
        sourceLength: sourceCode.length,
        extractedAt: Date.now()
      }
    };
  }

  /**
   * Извлечь подстроку кода по позициям
   */
  extractCodeByPosition(sourceCode, startPos, endPos) {
    return sourceCode.substring(startPos, endPos);
  }

  /**
   * Получить номер строки по позиции в тексте
   */
  getLineNumber(sourceCode, position) {
    return sourceCode.substring(0, position).split('\n').length;
  }

  /**
   * Очистить имя идентификатора
   */
  sanitizeIdentifier(name) {
    // Убираем специальные символы и пробелы
    return name?.replace(/[^\w.-]/g, '_') || 'unknown';
  }

  /**
   * Создать уникальный ID для элемента
   */
  createUniqueId(fileName, type, name, lineNumber = '') {
    const baseName = path.basename(fileName, path.extname(fileName));
    const sanitizedName = this.sanitizeIdentifier(name);
    const suffix = lineNumber ? `_L${lineNumber}` : '';
    
    return `${baseName}.${sanitizedName}${suffix}`;
  }

  /**
   * Определить тип элемента по AST узлу
   */
  determineItemType(nodeType) {
    const typeMap = {
      // Python
      'function_definition': 'function',
      'async_function_definition': 'function',
      'class_definition': 'class',
      'method_definition': 'method',
      
      // TypeScript/JavaScript  
      'function_declaration': 'function',
      'arrow_function': 'function',
      'method_definition': 'method',
      'class_declaration': 'class',
      'interface_declaration': 'interface',
      'type_alias_declaration': 'type',
      
      // Go
      'function_declaration': 'function',
      'method_declaration': 'method', 
      'type_declaration': 'type',
      'struct_type': 'struct',
      'interface_type': 'interface',
      
      // Java
      'method_declaration': 'method',
      'constructor_declaration': 'constructor',
      'class_declaration': 'class',
      'interface_declaration': 'interface',
      'enum_declaration': 'enum'
    };

    return typeMap[nodeType] || 'unknown';
  }

  /**
   * Извлечь комментарии документации
   */
  extractDocumentation(node, sourceCode) {
    // Базовая реализация - ищем комментарии перед узлом
    // Может быть переопределена в конкретных парсерах
    return null;
  }

  /**
   * Проверить, является ли узел публичным
   */
  isPublic(node) {
    // Базовая реализация - все публично
    // Может быть переопределена в конкретных парсерах
    return true;
  }

  /**
   * Логирование ошибок парсинга
   */
  logParsingError(filePath, error, context = {}) {
    console.warn(`[Parser Warning] ${filePath}: ${error.message}`, context);
  }

  /**
   * Получить статистику парсинга
   */
  getParsingStats(aiItems) {
    const stats = {
      total: aiItems.length,
      byType: {},
      averageLength: 0,
      totalLines: 0
    };

    aiItems.forEach(item => {
      stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
      stats.totalLines += (item.metadata?.endLine || 0) - (item.metadata?.startLine || 0) + 1;
      stats.averageLength += item.l0_code.length;
    });

    if (aiItems.length > 0) {
      stats.averageLength = Math.round(stats.averageLength / aiItems.length);
    }

    return stats;
  }
}
