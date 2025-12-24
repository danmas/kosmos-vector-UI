import { EventEmitter } from 'events';
import path from 'path';

/**
 * Анализатор зависимостей между элементами кода (L1)
 */
export class DependencyAnalyzer extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.projectPath = config.projectPath || process.cwd();
    
    // Кэш для импортов и символов
    this.importCache = new Map();
    this.symbolCache = new Map();
    this.fileSymbols = new Map(); // filePath -> Set<symbolName>
  }

  /**
   * Анализ зависимостей для одного элемента
   */
  async analyzeDependencies(item, allItems) {
    const dependencies = [];
    
    try {
      // Анализируем разные типы зависимостей
      const importDeps = await this.analyzeImportDependencies(item, allItems);
      const callDeps = await this.analyzeCallDependencies(item, allItems);
      const inheritanceDeps = await this.analyzeInheritanceDependencies(item, allItems);
      const typeDeps = await this.analyzeTypeDependencies(item, allItems);
      
      dependencies.push(...importDeps, ...callDeps, ...inheritanceDeps, ...typeDeps);
      
      // Убираем дубликаты
      const uniqueDeps = this.deduplicateDependencies(dependencies);
      
      this.emit('analyzed', {
        itemId: item.id,
        dependencyCount: uniqueDeps.length
      });
      
      return uniqueDeps;
      
    } catch (error) {
      console.warn(`Failed to analyze dependencies for ${item.id}: ${error.message}`);
      return [];
    }
  }

  /**
   * Анализ зависимостей через импорты
   */
  async analyzeImportDependencies(item, allItems) {
    const dependencies = [];
    const imports = this.extractImports(item.l0_code, item.language);
    
    for (const importInfo of imports) {
      // Ищем соответствующие элементы в других файлах
      const targetItems = this.findItemsByImport(importInfo, allItems);
      
      for (const targetItem of targetItems) {
        dependencies.push({
          type: 'import',
          from: item.id,
          to: targetItem.id,
          symbol: importInfo.symbol,
          module: importInfo.module,
          confidence: 0.9
        });
      }
    }
    
    return dependencies;
  }

  /**
   * Анализ зависимостей через вызовы функций/методов
   */
  async analyzeCallDependencies(item, allItems) {
    const dependencies = [];
    const calls = this.extractFunctionCalls(item.l0_code, item.language);
    
    for (const call of calls) {
      const targetItems = this.findItemsByCall(call, allItems);
      
      for (const targetItem of targetItems) {
        dependencies.push({
          type: 'call',
          from: item.id,
          to: targetItem.id,
          symbol: call.name,
          context: call.context,
          confidence: this.calculateCallConfidence(call, targetItem)
        });
      }
    }
    
    return dependencies;
  }

  /**
   * Анализ зависимостей наследования
   */
  async analyzeInheritanceDependencies(item, allItems) {
    const dependencies = [];
    
    if (item.type === 'class') {
      const inheritance = this.extractInheritance(item, allItems);
      
      for (const parent of inheritance.parents) {
        dependencies.push({
          type: 'inheritance',
          from: item.id,
          to: parent.id,
          relationship: 'extends',
          confidence: 0.95
        });
      }
      
      for (const interfaceItem of inheritance.interfaces) {
        dependencies.push({
          type: 'implementation',
          from: item.id,
          to: interfaceItem.id,
          relationship: 'implements',
          confidence: 0.95
        });
      }
    }
    
    return dependencies;
  }

  /**
   * Анализ типовых зависимостей
   */
  async analyzeTypeDependencies(item, allItems) {
    const dependencies = [];
    
    if (item.language === 'typescript' || item.language === 'java') {
      const types = this.extractTypeReferences(item.l0_code, item.language);
      
      for (const typeRef of types) {
        const targetItems = this.findItemsByType(typeRef, allItems);
        
        for (const targetItem of targetItems) {
          dependencies.push({
            type: 'type_reference',
            from: item.id,
            to: targetItem.id,
            symbol: typeRef.name,
            context: typeRef.context,
            confidence: 0.7
          });
        }
      }
    }
    
    return dependencies;
  }

  /**
   * Извлечь импорты из кода
   */
  extractImports(code, language) {
    const imports = [];
    
    switch (language) {
      case 'python':
        imports.push(...this.extractPythonImports(code));
        break;
      case 'typescript':
      case 'javascript':
        imports.push(...this.extractTSImports(code));
        break;
      case 'java':
        imports.push(...this.extractJavaImports(code));
        break;
      case 'go':
        imports.push(...this.extractGoImports(code));
        break;
    }
    
    return imports;
  }

  /**
   * Извлечь Python импорты
   */
  extractPythonImports(code) {
    const imports = [];
    const lines = code.split('\n');
    
    const patterns = [
      /^import\s+([a-zA-Z_][a-zA-Z0-9_.]*)/,
      /^from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import\s+([a-zA-Z_][a-zA-Z0-9_.,\s*]+)/
    ];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Простой import
      const simpleMatch = trimmed.match(patterns[0]);
      if (simpleMatch) {
        imports.push({
          type: 'module',
          module: simpleMatch[1],
          symbol: simpleMatch[1].split('.').pop()
        });
        continue;
      }
      
      // from...import
      const fromMatch = trimmed.match(patterns[1]);
      if (fromMatch) {
        const module = fromMatch[1];
        const symbols = fromMatch[2].split(',').map(s => s.trim().replace(/\s+as\s+.*/, ''));
        
        for (const symbol of symbols) {
          if (symbol && symbol !== '*') {
            imports.push({
              type: 'symbol',
              module: module,
              symbol: symbol
            });
          }
        }
      }
    }
    
    return imports;
  }

  /**
   * Извлечь TypeScript/JavaScript импорты
   */
  extractTSImports(code) {
    const imports = [];
    const lines = code.split('\n');
    
    const patterns = [
      /^import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+['"]([^'"]+)['"]/,
      /^import\s*\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/,
      /^import\s*\*\s+as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from\s+['"]([^'"]+)['"]/
    ];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Default import
      const defaultMatch = trimmed.match(patterns[0]);
      if (defaultMatch) {
        imports.push({
          type: 'default',
          module: defaultMatch[2],
          symbol: defaultMatch[1]
        });
        continue;
      }
      
      // Named imports
      const namedMatch = trimmed.match(patterns[1]);
      if (namedMatch) {
        const module = namedMatch[2];
        const symbols = namedMatch[1].split(',').map(s => s.trim().replace(/\s+as\s+.*/, ''));
        
        for (const symbol of symbols) {
          if (symbol) {
            imports.push({
              type: 'named',
              module: module,
              symbol: symbol
            });
          }
        }
        continue;
      }
      
      // Namespace import
      const namespaceMatch = trimmed.match(patterns[2]);
      if (namespaceMatch) {
        imports.push({
          type: 'namespace',
          module: namespaceMatch[2],
          symbol: namespaceMatch[1]
        });
      }
    }
    
    return imports;
  }

  /**
   * Извлечь Java импорты
   */
  extractJavaImports(code) {
    const imports = [];
    const lines = code.split('\n');
    
    const pattern = /^import\s+(?:static\s+)?([a-zA-Z_$][a-zA-Z0-9_$.]*\.?)([a-zA-Z_$][a-zA-Z0-9_$*]*);/;
    
    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(pattern);
      
      if (match) {
        const fullPath = match[1] + match[2];
        const symbol = match[2] === '*' ? null : match[2];
        
        imports.push({
          type: symbol ? 'class' : 'package',
          module: fullPath,
          symbol: symbol,
          isStatic: trimmed.includes('static')
        });
      }
    }
    
    return imports;
  }

  /**
   * Извлечь Go импорты
   */
  extractGoImports(code) {
    const imports = [];
    const lines = code.split('\n');
    
    let inImportBlock = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === 'import (') {
        inImportBlock = true;
        continue;
      }
      
      if (inImportBlock && trimmed === ')') {
        inImportBlock = false;
        continue;
      }
      
      // Простой import
      const simpleMatch = trimmed.match(/^import\s+"([^"]+)"/);
      if (simpleMatch) {
        imports.push({
          type: 'package',
          module: simpleMatch[1],
          symbol: path.basename(simpleMatch[1])
        });
        continue;
      }
      
      // Import в блоке
      if (inImportBlock) {
        const blockMatch = trimmed.match(/^"([^"]+)"/);
        if (blockMatch) {
          imports.push({
            type: 'package',
            module: blockMatch[1],
            symbol: path.basename(blockMatch[1])
          });
        }
      }
    }
    
    return imports;
  }

  /**
   * Извлечь вызовы функций
   */
  extractFunctionCalls(code, language) {
    const calls = [];
    
    // Универсальные паттерны для вызовов функций
    const patterns = [
      /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, // Простые вызовы
      /([a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, // Методы
      /([a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g // Цепочки вызовов
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        const fullCall = match[1];
        const parts = fullCall.split('.');
        
        calls.push({
          name: parts[parts.length - 1], // Имя функции
          fullName: fullCall,
          context: parts.length > 1 ? parts.slice(0, -1).join('.') : null,
          line: this.getLineNumber(code, match.index)
        });
      }
    }
    
    return calls;
  }

  /**
   * Извлечь наследование
   */
  extractInheritance(item, allItems) {
    const result = { parents: [], interfaces: [] };
    
    if (item.metadata) {
      // Суперклассы
      if (item.metadata.superclass) {
        const parent = this.findItemByName(item.metadata.superclass, allItems, 'class');
        if (parent) result.parents.push(parent);
      }
      
      if (item.metadata.baseClasses) {
        for (const baseName of item.metadata.baseClasses) {
          const parent = this.findItemByName(baseName, allItems, 'class');
          if (parent) result.parents.push(parent);
        }
      }
      
      // Интерфейсы
      if (item.metadata.interfaces) {
        for (const interfaceName of item.metadata.interfaces) {
          const interfaceItem = this.findItemByName(interfaceName, allItems, 'interface');
          if (interfaceItem) result.interfaces.push(interfaceItem);
        }
      }
    }
    
    return result;
  }

  /**
   * Извлечь ссылки на типы
   */
  extractTypeReferences(code, language) {
    const types = [];
    
    if (language === 'typescript') {
      // Поиск типов в TypeScript
      const patterns = [
        /:\s*([A-Z][a-zA-Z0-9_$]*)/g, // Типы переменных
        /<([A-Z][a-zA-Z0-9_$]*)>/g, // Дженерики
        /extends\s+([A-Z][a-zA-Z0-9_$]*)/g, // Наследование
        /implements\s+([A-Z][a-zA-Z0-9_$]*)/g // Реализация
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(code)) !== null) {
          types.push({
            name: match[1],
            context: 'type_annotation',
            line: this.getLineNumber(code, match.index)
          });
        }
      }
    }
    
    return types;
  }

  /**
   * Найти элементы по импорту
   */
  findItemsByImport(importInfo, allItems) {
    const matches = [];
    
    for (const item of allItems) {
      // Проверяем совпадение модуля и символа
      if (this.matchesImport(item, importInfo)) {
        matches.push(item);
      }
    }
    
    return matches;
  }

  /**
   * Найти элементы по вызову
   */
  findItemsByCall(call, allItems) {
    const matches = [];
    
    for (const item of allItems) {
      if (item.type === 'function' || item.type === 'method') {
        // Простое совпадение по имени
        const itemName = this.extractNameFromId(item.id);
        if (itemName === call.name) {
          matches.push(item);
        }
        
        // Совпадение с полным именем (для методов)
        if (call.fullName && item.id.includes(call.fullName)) {
          matches.push(item);
        }
      }
    }
    
    return matches;
  }

  /**
   * Найти элементы по типу
   */
  findItemsByType(typeRef, allItems) {
    const matches = [];
    
    for (const item of allItems) {
      if (item.type === 'class' || item.type === 'interface' || item.type === 'type') {
        const itemName = this.extractNameFromId(item.id);
        if (itemName === typeRef.name) {
          matches.push(item);
        }
      }
    }
    
    return matches;
  }

  /**
   * Найти элемент по имени
   */
  findItemByName(name, allItems, type = null) {
    for (const item of allItems) {
      if (type && item.type !== type) continue;
      
      const itemName = this.extractNameFromId(item.id);
      if (itemName === name) {
        return item;
      }
    }
    
    return null;
  }

  /**
   * Проверить соответствие импорта
   */  
  matchesImport(item, importInfo) {
    const itemName = this.extractNameFromId(item.id);
    
    // Проверяем совпадение символа
    if (importInfo.symbol && itemName === importInfo.symbol) {
      return true;
    }
    
    // Проверяем модуль (по пути файла)
    if (importInfo.module && item.filePath) {
      const normalizedModule = this.normalizeModulePath(importInfo.module);
      const normalizedPath = this.normalizeModulePath(item.filePath);
      
      if (normalizedPath.includes(normalizedModule) || normalizedModule.includes(normalizedPath)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Вычислить уверенность для вызова
   */
  calculateCallConfidence(call, targetItem) {
    let confidence = 0.5; // Базовая уверенность
    
    // Повышаем уверенность если есть контекст
    if (call.context && targetItem.metadata?.className) {
      if (call.context === targetItem.metadata.className) {
        confidence += 0.3;
      }
    }
    
    // Повышаем если имена точно совпадают
    const targetName = this.extractNameFromId(targetItem.id);
    if (call.name === targetName) {
      confidence += 0.2;
    }
    
    return Math.min(1.0, confidence);
  }

  /**
   * Построить граф зависимостей
   */
  buildDependencyGraph(aiItems) {
    const nodes = aiItems.map(item => ({
      id: item.id,
      type: item.type,
      language: item.language,
      filePath: item.filePath
    }));
    
    const links = [];
    
    for (const item of aiItems) {
      if (item.l1_deps) {
        for (const dep of item.l1_deps) {
          links.push({
            source: dep.from,
            target: dep.to,
            type: dep.type,
            confidence: dep.confidence,
            symbol: dep.symbol
          });
        }
      }
    }
    
    return { nodes, links };
  }

  /**
   * Убрать дубликаты зависимостей
   */
  deduplicateDependencies(dependencies) {
    const seen = new Set();
    const unique = [];
    
    for (const dep of dependencies) {
      const key = `${dep.type}:${dep.from}:${dep.to}:${dep.symbol || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(dep);
      }
    }
    
    return unique;
  }

  /**
   * Извлечь имя из ID элемента
   */
  extractNameFromId(id) {
    // ID обычно в формате "file.name" или "file.class.method"
    const parts = id.split('.');
    return parts[parts.length - 1];
  }

  /**
   * Нормализовать путь модуля
   */
  normalizeModulePath(modulePath) {
    return modulePath
      .replace(/['"]/g, '') // Убираем кавычки
      .replace(/\\/g, '/') // Нормализуем слеши
      .replace(/\.(js|ts|py|java|go)$/, '') // Убираем расширения
      .toLowerCase();
  }

  /**
   * Получить номер строки по позиции
   */
  getLineNumber(text, position) {
    return text.substring(0, position).split('\n').length;
  }
}
