import { BaseParser } from './BaseParser.js';
import Parser from 'tree-sitter';

/**
 * Парсер для Python файлов
 */
export class PythonParser extends BaseParser {
  constructor(config) {
    super(config);
    this.language = 'python';
    this.parser = null;
  }

  /**
   * Инициализация Tree-sitter парсера для Python
   */
  async initializeParser() {
    if (!this.parser) {
      try {
        // Попытка загрузить tree-sitter-python
        const Python = await import('tree-sitter-python');
        this.parser = new Parser();
        this.parser.setLanguage(Python.default);
      } catch (error) {
        console.warn('Tree-sitter-python not available, falling back to regex parser');
        this.parser = null;
      }
    }
  }

  /**
   * Парсинг Python файла
   */
  async parseFile(filePath) {
    const sourceCode = await this.readFile(filePath);
    await this.initializeParser();

    if (this.parser) {
      return this.parseWithTreeSitter(filePath, sourceCode);
    } else {
      return this.parseWithRegex(filePath, sourceCode);
    }
  }

  /**
   * Парсинг с помощью Tree-sitter
   */
  parseWithTreeSitter(filePath, sourceCode) {
    const tree = this.parser.parse(sourceCode);
    const aiItems = [];

    this.traverseNode(tree.rootNode, sourceCode, filePath, aiItems);
    
    return aiItems;
  }

  /**
   * Обход AST узлов
   */
  traverseNode(node, sourceCode, filePath, aiItems) {
    // Обрабатываем узлы разных типов
    switch (node.type) {
      case 'function_definition':
      case 'async_function_definition':
        this.handleFunction(node, sourceCode, filePath, aiItems);
        break;
        
      case 'class_definition':
        this.handleClass(node, sourceCode, filePath, aiItems);
        break;
    }

    // Рекурсивно обрабатываем дочерние узлы
    for (const child of node.children) {
      this.traverseNode(child, sourceCode, filePath, aiItems);
    }
  }

  /**
   * Обработка функций
   */
  handleFunction(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    const id = this.createUniqueId(filePath, 'function', name, startLine);
    const isAsync = node.type === 'async_function_definition';
    
    const aiItem = this.createAiItem(
      id,
      'function',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    // Добавляем дополнительные метаданные для Python функций
    aiItem.metadata.isAsync = isAsync;
    aiItem.metadata.parameters = this.extractParameters(node);
    aiItem.metadata.decorators = this.extractDecorators(node);
    aiItem.metadata.docstring = this.extractDocstring(node, sourceCode);

    aiItems.push(aiItem);
  }

  /**
   * Обработка классов
   */
  handleClass(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    const id = this.createUniqueId(filePath, 'class', name, startLine);
    
    const aiItem = this.createAiItem(
      id,
      'class',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    // Добавляем метаданные для Python классов
    aiItem.metadata.baseClasses = this.extractBaseClasses(node);
    aiItem.metadata.docstring = this.extractDocstring(node, sourceCode);
    aiItem.metadata.methods = this.extractClassMethods(node, sourceCode, filePath);

    aiItems.push(aiItem);
  }

  /**
   * Парсинг с помощью регулярных выражений (fallback)
   */
  parseWithRegex(filePath, sourceCode) {
    console.warn(`Using regex fallback parser for ${filePath}`);
    
    const aiItems = [];
    const lines = sourceCode.split('\n');

    // Паттерны для Python конструкций
    const patterns = {
      function: /^\s*(?:async\s+)?def\s+(\w+)\s*\(/,
      class: /^\s*class\s+(\w+)(?:\([^)]*\))?:/,
      method: /^\s+(?:async\s+)?def\s+(\w+)\s*\(/
    };

    let currentClass = null;
    let currentIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Определяем уровень отступа
      const indent = line.length - line.trimLeft().length;

      // Если отступ уменьшился, выходим из класса
      if (currentClass && indent <= currentIndent) {
        currentClass = null;
      }

      for (const [type, pattern] of Object.entries(patterns)) {
        const match = line.match(pattern);
        if (match) {
          const name = match[1];
          
          // Для методов проверяем, что мы внутри класса
          if (type === 'method' && !currentClass) continue;
          
          const code = this.extractFunctionOrClassCode(lines, i);
          const endLineNumber = i + code.split('\n').length;
          
          const id = currentClass 
            ? this.createUniqueId(filePath, 'method', `${currentClass}.${name}`, lineNumber)
            : this.createUniqueId(filePath, type, name, lineNumber);

          const aiItem = this.createAiItem(
            id,
            type === 'method' ? 'method' : type,
            this.language,
            filePath,
            code,
            lineNumber,
            endLineNumber
          );

          aiItems.push(aiItem);

          // Запоминаем текущий класс
          if (type === 'class') {
            currentClass = name;
            currentIndent = indent;
          }
          
          break;
        }
      }
    }

    return aiItems;
  }

  /**
   * Извлечь код функции или класса
   */
  extractFunctionOrClassCode(lines, startIndex) {
    const startLine = lines[startIndex];
    const baseIndent = startLine.length - startLine.trimLeft().length;
    
    let code = startLine + '\n';
    let i = startIndex + 1;
    
    while (i < lines.length) {
      const line = lines[i];
      
      // Пустые строки и комментарии включаем
      if (!line.trim() || line.trim().startsWith('#')) {
        code += line + '\n';
        i++;
        continue;
      }
      
      const lineIndent = line.length - line.trimLeft().length;
      
      // Если отступ меньше или равен базовому, завершаем
      if (lineIndent <= baseIndent) {
        break;
      }
      
      code += line + '\n';
      i++;
    }
    
    return code.trim();
  }

  /**
   * Извлечь параметры функции (Tree-sitter)
   */
  extractParameters(functionNode) {
    const parametersNode = functionNode.childForFieldName('parameters');
    if (!parametersNode) return [];

    const params = [];
    for (const child of parametersNode.children) {
      if (child.type === 'identifier') {
        params.push({ name: child.text, type: null, default: null });
      } else if (child.type === 'default_parameter') {
        const nameNode = child.childForFieldName('name');
        const valueNode = child.childForFieldName('value');
        params.push({
          name: nameNode?.text || 'unknown',
          type: null,
          default: valueNode?.text || null
        });
      }
    }
    
    return params;
  }

  /**
   * Извлечь декораторы
   */
  extractDecorators(node) {
    const decorators = [];
    
    // Ищем декораторы перед узлом
    let prev = node.previousSibling;
    while (prev && prev.type === 'decorator') {
      decorators.unshift(prev.text);
      prev = prev.previousSibling;
    }
    
    return decorators;
  }

  /**
   * Извлечь docstring
   */
  extractDocstring(node, sourceCode) {
    // Ищем первую строку в теле функции/класса
    const bodyNode = node.childForFieldName('body');
    if (!bodyNode) return null;

    const firstChild = bodyNode.children.find(child => 
      child.type === 'expression_statement'
    );

    if (firstChild) {
      const stringNode = firstChild.children.find(child => 
        child.type === 'string'
      );
      
      if (stringNode) {
        return stringNode.text.replace(/^['"`]{1,3}|['"`]{1,3}$/g, '').trim();
      }
    }
    
    return null;
  }

  /**
   * Извлечь базовые классы
   */
  extractBaseClasses(classNode) {
    const superclassesNode = classNode.childForFieldName('superclasses');
    if (!superclassesNode) return [];

    return superclassesNode.children
      .filter(child => child.type === 'identifier')
      .map(child => child.text);
  }

  /**
   * Извлечь методы класса
   */
  extractClassMethods(classNode, sourceCode, filePath) {
    const methods = [];
    const bodyNode = classNode.childForFieldName('body');
    if (!bodyNode) return methods;

    this.traverseForMethods(bodyNode, sourceCode, methods);
    
    return methods;
  }

  /**
   * Обход для поиска методов
   */
  traverseForMethods(node, sourceCode, methods) {
    if (node.type === 'function_definition' || node.type === 'async_function_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        methods.push({
          name: nameNode.text,
          isAsync: node.type === 'async_function_definition',
          startLine: this.getLineNumber(sourceCode, node.startPosition),
          endLine: this.getLineNumber(sourceCode, node.endPosition)
        });
      }
    }

    for (const child of node.children) {
      this.traverseForMethods(child, sourceCode, methods);
    }
  }
}
