import { BaseParser } from './BaseParser.js';
import Parser from 'tree-sitter';

/**
 * Парсер для TypeScript/JavaScript файлов
 */
export class TypeScriptParser extends BaseParser {
  constructor(config) {
    super(config);
    this.language = 'typescript';
    this.parser = null;
  }

  /**
   * Инициализация Tree-sitter парсера для TypeScript
   */
  async initializeParser() {
    if (!this.parser) {
      try {
        // Попытка загрузить tree-sitter-typescript
        const TypeScript = await import('tree-sitter-typescript');
        this.parser = new Parser();
        this.parser.setLanguage(TypeScript.typescript);
      } catch (error) {
        console.warn('Tree-sitter-typescript not available, falling back to regex parser');
        this.parser = null;
      }
    }
  }

  /**
   * Парсинг TypeScript/JavaScript файла
   */
  async parseFile(filePath) {
    const sourceCode = await this.readFile(filePath);
    await this.initializeParser();
    
    // Определяем язык по расширению файла
    this.language = filePath.endsWith('.js') || filePath.endsWith('.jsx') ? 'javascript' : 'typescript';

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
    switch (node.type) {
      case 'function_declaration':
        this.handleFunction(node, sourceCode, filePath, aiItems);
        break;
        
      case 'arrow_function':
      case 'function_expression':
        this.handleArrowFunction(node, sourceCode, filePath, aiItems);
        break;
        
      case 'method_definition':
        this.handleMethod(node, sourceCode, filePath, aiItems);
        break;
        
      case 'class_declaration':
        this.handleClass(node, sourceCode, filePath, aiItems);
        break;
        
      case 'interface_declaration':
        this.handleInterface(node, sourceCode, filePath, aiItems);
        break;
        
      case 'type_alias_declaration':
        this.handleTypeAlias(node, sourceCode, filePath, aiItems);
        break;
        
      case 'variable_declaration':
        this.handleVariableDeclaration(node, sourceCode, filePath, aiItems);
        break;
    }

    // Рекурсивно обрабатываем дочерние узлы
    for (const child of node.children) {
      this.traverseNode(child, sourceCode, filePath, aiItems);
    }
  }

  /**
   * Обработка объявления функций
   */
  handleFunction(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    const id = this.createUniqueId(filePath, 'function', name, startLine);
    
    const aiItem = this.createAiItem(
      id,
      'function',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    // Дополнительные метаданные
    aiItem.metadata.isAsync = this.isAsyncFunction(node);
    aiItem.metadata.isExported = this.isExported(node);
    aiItem.metadata.parameters = this.extractFunctionParameters(node);
    aiItem.metadata.returnType = this.extractReturnType(node);
    aiItem.metadata.jsDoc = this.extractJSDoc(node, sourceCode);

    aiItems.push(aiItem);
  }

  /**
   * Обработка arrow функций и function expressions
   */
  handleArrowFunction(node, sourceCode, filePath, aiItems) {
    // Пытаемся найти имя через родительский узел (переменную или свойство)
    let name = 'anonymous';
    let parent = node.parent;
    
    if (parent?.type === 'variable_declarator') {
      const nameNode = parent.childForFieldName('name');
      name = nameNode?.text || 'anonymous';
    } else if (parent?.type === 'pair') {
      const keyNode = parent.childForFieldName('key');
      name = keyNode?.text || 'anonymous';
    } else if (parent?.type === 'assignment_expression') {
      const leftNode = parent.childForFieldName('left');
      name = leftNode?.text || 'anonymous';
    }

    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    const id = this.createUniqueId(filePath, 'function', name, startLine);
    
    const aiItem = this.createAiItem(
      id,
      'function',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    aiItem.metadata.isArrow = true;
    aiItem.metadata.isAsync = this.isAsyncFunction(node);
    aiItem.metadata.parameters = this.extractFunctionParameters(node);
    aiItem.metadata.returnType = this.extractReturnType(node);

    aiItems.push(aiItem);
  }

  /**
   * Обработка методов
   */
  handleMethod(node, sourceCode, filePath, aiItems) {
    const keyNode = node.childForFieldName('key');
    if (!keyNode) return;

    const name = keyNode.text;
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    // Пытаемся найти имя класса
    const className = this.findParentClassName(node);
    const fullName = className ? `${className}.${name}` : name;
    
    const id = this.createUniqueId(filePath, 'method', fullName, startLine);
    
    const aiItem = this.createAiItem(
      id,
      'method',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    aiItem.metadata.className = className;
    aiItem.metadata.isStatic = this.isStaticMethod(node);
    aiItem.metadata.isAsync = this.isAsyncFunction(node);
    aiItem.metadata.accessibility = this.getAccessibility(node);
    aiItem.metadata.parameters = this.extractFunctionParameters(node);
    aiItem.metadata.returnType = this.extractReturnType(node);

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

    aiItem.metadata.isExported = this.isExported(node);
    aiItem.metadata.isAbstract = this.isAbstractClass(node);
    aiItem.metadata.superclass = this.extractSuperclass(node);
    aiItem.metadata.interfaces = this.extractImplementedInterfaces(node);
    aiItem.metadata.typeParameters = this.extractTypeParameters(node);

    aiItems.push(aiItem);
  }

  /**
   * Обработка интерфейсов
   */
  handleInterface(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    const id = this.createUniqueId(filePath, 'interface', name, startLine);
    
    const aiItem = this.createAiItem(
      id,
      'interface',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    aiItem.metadata.isExported = this.isExported(node);
    aiItem.metadata.extendsInterfaces = this.extractExtendedInterfaces(node);
    aiItem.metadata.typeParameters = this.extractTypeParameters(node);

    aiItems.push(aiItem);
  }

  /**
   * Обработка алиасов типов
   */
  handleTypeAlias(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    const id = this.createUniqueId(filePath, 'type', name, startLine);
    
    const aiItem = this.createAiItem(
      id,
      'type',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    aiItem.metadata.isExported = this.isExported(node);
    aiItem.metadata.typeParameters = this.extractTypeParameters(node);

    aiItems.push(aiItem);
  }

  /**
   * Обработка объявлений переменных (для захвата функций)
   */
  handleVariableDeclaration(node, sourceCode, filePath, aiItems) {
    // Ищем функции, присвоенные переменным
    for (const declarator of node.children) {
      if (declarator.type === 'variable_declarator') {
        const nameNode = declarator.childForFieldName('name');
        const valueNode = declarator.childForFieldName('value');
        
        if (nameNode && valueNode && 
            (valueNode.type === 'arrow_function' || valueNode.type === 'function_expression')) {
          
          const name = nameNode.text;
          const startLine = this.getLineNumber(sourceCode, valueNode.startPosition);
          const endLine = this.getLineNumber(sourceCode, valueNode.endPosition);
          const code = this.extractCodeByPosition(sourceCode, valueNode.startPosition, valueNode.endPosition);
          
          const id = this.createUniqueId(filePath, 'function', name, startLine);
          
          const aiItem = this.createAiItem(
            id,
            'function',
            this.language,
            filePath,
            code,
            startLine,
            endLine
          );

          aiItem.metadata.isVariableFunction = true;
          aiItem.metadata.isAsync = this.isAsyncFunction(valueNode);
          aiItem.metadata.parameters = this.extractFunctionParameters(valueNode);

          aiItems.push(aiItem);
        }
      }
    }
  }

  /**
   * Парсинг с помощью регулярных выражений (fallback)
   */
  parseWithRegex(filePath, sourceCode) {
    console.warn(`Using regex fallback parser for ${filePath}`);
    
    const aiItems = [];
    const lines = sourceCode.split('\n');

    // Паттерны для TypeScript/JavaScript конструкций
    const patterns = {
      function: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      class: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
      interface: /^\s*(?:export\s+)?interface\s+(\w+)/,
      type: /^\s*(?:export\s+)?type\s+(\w+)/,
      arrow: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
      method: /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\(/
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      for (const [type, pattern] of Object.entries(patterns)) {
        const match = line.match(pattern);
        if (match) {
          const name = match[1];
          const code = this.extractFunctionOrClassCodeTS(lines, i);
          const endLineNumber = i + code.split('\n').length;
          
          const id = this.createUniqueId(filePath, type, name, lineNumber);

          const aiItem = this.createAiItem(
            id,
            type === 'arrow' ? 'function' : type,
            this.language,
            filePath,
            code,
            lineNumber,
            endLineNumber
          );

          aiItems.push(aiItem);
          break;
        }
      }
    }

    return aiItems;
  }

  /**
   * Извлечь код функции или класса для TS/JS
   */
  extractFunctionOrClassCodeTS(lines, startIndex) {
    const startLine = lines[startIndex];
    let code = startLine;
    let braceCount = (startLine.match(/\{/g) || []).length - (startLine.match(/\}/g) || []).length;
    
    if (braceCount === 0 && !startLine.includes('{')) {
      // Однострочная arrow функция
      return startLine;
    }
    
    let i = startIndex + 1;
    
    while (i < lines.length && braceCount > 0) {
      const line = lines[i];
      code += '\n' + line;
      
      braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      i++;
    }
    
    return code;
  }

  // Вспомогательные методы

  isAsyncFunction(node) {
    return node.text.includes('async') || 
           node.children.some(child => child.type === 'async');
  }

  isExported(node) {
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'export_statement' || parent.type === 'export_declaration') {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }

  isStaticMethod(node) {
    return node.children.some(child => child.type === 'static');
  }

  isAbstractClass(node) {
    return node.children.some(child => child.type === 'abstract');
  }

  getAccessibility(node) {
    const modifiers = ['public', 'private', 'protected'];
    for (const modifier of modifiers) {
      if (node.children.some(child => child.type === modifier)) {
        return modifier;
      }
    }
    return 'public'; // По умолчанию
  }

  findParentClassName(node) {
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'class_declaration') {
        const nameNode = parent.childForFieldName('name');
        return nameNode?.text;
      }
      parent = parent.parent;
    }
    return null;
  }

  extractFunctionParameters(node) {
    const parametersNode = node.childForFieldName('parameters');
    if (!parametersNode) return [];

    const params = [];
    for (const child of parametersNode.children) {
      if (child.type === 'identifier' || child.type === 'required_parameter') {
        params.push({ 
          name: child.text, 
          type: null, 
          optional: false,
          default: null 
        });
      } else if (child.type === 'optional_parameter') {
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');
        params.push({
          name: nameNode?.text || 'unknown',
          type: typeNode?.text || null,
          optional: true,
          default: null
        });
      }
    }
    
    return params;
  }

  extractReturnType(node) {
    const returnTypeNode = node.childForFieldName('return_type');
    return returnTypeNode?.text || null;
  }

  extractJSDoc(node, sourceCode) {
    // Ищем JSDoc комментарий перед узлом
    const lines = sourceCode.split('\n');
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    
    let docLines = [];
    for (let i = startLine - 2; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('*/')) {
        continue;
      } else if (line.startsWith('*') || line.startsWith('/**')) {
        docLines.unshift(line);
      } else if (docLines.length > 0) {
        break;
      } else if (!line) {
        continue;
      } else {
        break;
      }
    }
    
    return docLines.length > 0 ? docLines.join('\n') : null;
  }

  extractSuperclass(node) {
    const heritage = node.childForFieldName('superclass');
    return heritage?.text || null;
  }

  extractImplementedInterfaces(node) {
    // Для TypeScript классов
    const interfaces = [];
    // Реализация зависит от структуры AST
    return interfaces;
  }

  extractExtendedInterfaces(node) {
    // Для TypeScript интерфейсов
    const interfaces = [];
    // Реализация зависит от структуры AST
    return interfaces;
  }

  extractTypeParameters(node) {
    const typeParams = node.childForFieldName('type_parameters');
    if (!typeParams) return [];
    
    return typeParams.children
      .filter(child => child.type === 'type_parameter')
      .map(param => param.text);
  }
}
