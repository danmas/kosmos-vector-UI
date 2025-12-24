import { BaseParser } from './BaseParser.js';
import Parser from 'tree-sitter';

/**
 * Парсер для Java файлов
 */
export class JavaParser extends BaseParser {
  constructor(config) {
    super(config);
    this.language = 'java';
    this.parser = null;
  }

  /**
   * Инициализация Tree-sitter парсера для Java
   */
  async initializeParser() {
    if (!this.parser) {
      try {
        // Попытка загрузить tree-sitter-java
        const Java = await import('tree-sitter-java');
        this.parser = new Parser();
        this.parser.setLanguage(Java.default);
      } catch (error) {
        console.warn('Tree-sitter-java not available, falling back to regex parser');
        this.parser = null;
      }
    }
  }

  /**
   * Парсинг Java файла
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
    switch (node.type) {
      case 'class_declaration':
        this.handleClass(node, sourceCode, filePath, aiItems);
        break;
        
      case 'interface_declaration':
        this.handleInterface(node, sourceCode, filePath, aiItems);
        break;
        
      case 'enum_declaration':
        this.handleEnum(node, sourceCode, filePath, aiItems);
        break;
        
      case 'method_declaration':
        this.handleMethod(node, sourceCode, filePath, aiItems);
        break;
        
      case 'constructor_declaration':
        this.handleConstructor(node, sourceCode, filePath, aiItems);
        break;
        
      case 'annotation_type_declaration':
        this.handleAnnotation(node, sourceCode, filePath, aiItems);
        break;
    }

    // Рекурсивно обрабатываем дочерние узлы
    for (const child of node.children) {
      this.traverseNode(child, sourceCode, filePath, aiItems);
    }
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

    // Метаданные для Java классов
    aiItem.metadata.modifiers = this.extractModifiers(node);
    aiItem.metadata.isAbstract = this.hasModifier(node, 'abstract');
    aiItem.metadata.isFinal = this.hasModifier(node, 'final');
    aiItem.metadata.isPublic = this.hasModifier(node, 'public');
    aiItem.metadata.superclass = this.extractSuperclass(node);
    aiItem.metadata.interfaces = this.extractImplementedInterfaces(node);
    aiItem.metadata.typeParameters = this.extractTypeParameters(node);
    aiItem.metadata.annotations = this.extractAnnotations(node);
    aiItem.metadata.javadoc = this.extractJavaDoc(node, sourceCode);

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

    // Метаданные для Java интерфейсов
    aiItem.metadata.modifiers = this.extractModifiers(node);
    aiItem.metadata.isPublic = this.hasModifier(node, 'public');
    aiItem.metadata.extendsInterfaces = this.extractExtendedInterfaces(node);
    aiItem.metadata.typeParameters = this.extractTypeParameters(node);
    aiItem.metadata.annotations = this.extractAnnotations(node);
    aiItem.metadata.javadoc = this.extractJavaDoc(node, sourceCode);

    aiItems.push(aiItem);
  }

  /**
   * Обработка enum'ов
   */
  handleEnum(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    const id = this.createUniqueId(filePath, 'enum', name, startLine);
    
    const aiItem = this.createAiItem(
      id,
      'enum',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    // Метаданные для Java enum'ов
    aiItem.metadata.modifiers = this.extractModifiers(node);
    aiItem.metadata.isPublic = this.hasModifier(node, 'public');
    aiItem.metadata.enumConstants = this.extractEnumConstants(node);
    aiItem.metadata.interfaces = this.extractImplementedInterfaces(node);
    aiItem.metadata.annotations = this.extractAnnotations(node);
    aiItem.metadata.javadoc = this.extractJavaDoc(node, sourceCode);

    aiItems.push(aiItem);
  }

  /**
   * Обработка методов
   */
  handleMethod(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    
    // Находим родительский класс
    const className = this.findParentClassName(node);
    const fullName = className ? `${className}.${name}` : name;
    
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
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

    // Метаданные для Java методов
    aiItem.metadata.className = className;
    aiItem.metadata.modifiers = this.extractModifiers(node);
    aiItem.metadata.isPublic = this.hasModifier(node, 'public');
    aiItem.metadata.isPrivate = this.hasModifier(node, 'private');
    aiItem.metadata.isProtected = this.hasModifier(node, 'protected');
    aiItem.metadata.isStatic = this.hasModifier(node, 'static');
    aiItem.metadata.isAbstract = this.hasModifier(node, 'abstract');
    aiItem.metadata.isFinal = this.hasModifier(node, 'final');
    aiItem.metadata.returnType = this.extractReturnType(node);
    aiItem.metadata.parameters = this.extractMethodParameters(node);
    aiItem.metadata.exceptions = this.extractThrowsClause(node);
    aiItem.metadata.typeParameters = this.extractTypeParameters(node);
    aiItem.metadata.annotations = this.extractAnnotations(node);
    aiItem.metadata.javadoc = this.extractJavaDoc(node, sourceCode);

    aiItems.push(aiItem);
  }

  /**
   * Обработка конструкторов
   */
  handleConstructor(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const className = this.findParentClassName(node);
    const fullName = className ? `${className}.${name}` : name;
    
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    const id = this.createUniqueId(filePath, 'constructor', fullName, startLine);
    
    const aiItem = this.createAiItem(
      id,
      'constructor',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    // Метаданные для Java конструкторов
    aiItem.metadata.className = className;
    aiItem.metadata.modifiers = this.extractModifiers(node);
    aiItem.metadata.isPublic = this.hasModifier(node, 'public');
    aiItem.metadata.isPrivate = this.hasModifier(node, 'private');
    aiItem.metadata.isProtected = this.hasModifier(node, 'protected');
    aiItem.metadata.parameters = this.extractMethodParameters(node);
    aiItem.metadata.exceptions = this.extractThrowsClause(node);
    aiItem.metadata.annotations = this.extractAnnotations(node);
    aiItem.metadata.javadoc = this.extractJavaDoc(node, sourceCode);

    aiItems.push(aiItem);
  }

  /**
   * Обработка аннотаций
   */
  handleAnnotation(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    const id = this.createUniqueId(filePath, 'annotation', name, startLine);
    
    const aiItem = this.createAiItem(
      id,
      'annotation',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    // Метаданные для Java аннотаций
    aiItem.metadata.modifiers = this.extractModifiers(node);
    aiItem.metadata.isPublic = this.hasModifier(node, 'public');
    aiItem.metadata.javadoc = this.extractJavaDoc(node, sourceCode);

    aiItems.push(aiItem);
  }

  /**
   * Парсинг с помощью регулярных выражений (fallback)
   */
  parseWithRegex(filePath, sourceCode) {
    console.warn(`Using regex fallback parser for ${filePath}`);
    
    const aiItems = [];
    const lines = sourceCode.split('\n');

    // Паттерны для Java конструкций
    const patterns = {
      class: /^\s*(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+(\w+)/,
      interface: /^\s*(?:public|private|protected)?\s*interface\s+(\w+)/,
      enum: /^\s*(?:public|private|protected)?\s*enum\s+(\w+)/,
      method: /^\s*(?:public|private|protected)?\s*(?:static|final|abstract)?\s*(?:\w+(?:<[^>]+>)?(?:\[\])?\s+)?(\w+)\s*\(/,
      annotation: /^\s*(?:public)?\s*@interface\s+(\w+)/
    };

    let currentClass = null;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Отслеживаем вложенность классов
      braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;

      for (const [type, pattern] of Object.entries(patterns)) {
        const match = line.match(pattern);
        if (match) {
          const name = match[1];
          
          // Для методов проверяем, что это не конструктор
          if (type === 'method') {
            // Пропускаем если это конструктор (имя совпадает с классом)
            if (currentClass && name === currentClass) continue;
            
            // Пропускаем if, for, while и другие ключевые слова
            if (['if', 'for', 'while', 'switch', 'catch', 'synchronized'].includes(name)) continue;
          }
          
          const code = this.extractJavaConstruct(lines, i, type);
          const endLineNumber = i + code.split('\n').length;
          
          let fullName = name;
          if (type === 'method' && currentClass) {
            fullName = `${currentClass}.${name}`;
          }
          
          const id = this.createUniqueId(filePath, type, fullName, lineNumber);

          const aiItem = this.createAiItem(
            id,
            type,
            this.language,
            filePath,
            code,
            lineNumber,
            endLineNumber
          );

          // Добавляем базовые метаданные
          if (type === 'method') {
            aiItem.metadata.className = currentClass;
          }

          aiItems.push(aiItem);

          // Запоминаем текущий класс
          if (type === 'class' || type === 'interface' || type === 'enum') {
            currentClass = name;
          }
          
          break;
        }
      }
    }

    return aiItems;
  }

  /**
   * Извлечь Java конструкцию
   */
  extractJavaConstruct(lines, startIndex, type) {
    const startLine = lines[startIndex];
    let code = startLine;
    
    // Для классов, интерфейсов и enum'ов ищем весь блок
    if (['class', 'interface', 'enum', 'annotation'].includes(type)) {
      let braceCount = (startLine.match(/\{/g) || []).length - (startLine.match(/\}/g) || []).length;
      let i = startIndex + 1;
      
      // Если открывающая скобка не на той же строке
      if (braceCount === 0 && !startLine.includes('{')) {
        while (i < lines.length && !lines[i].includes('{')) {
          code += '\n' + lines[i];
          i++;
        }
        if (i < lines.length) {
          code += '\n' + lines[i];
          braceCount = 1;
          i++;
        }
      }
      
      while (i < lines.length && braceCount > 0) {
        const line = lines[i];
        code += '\n' + line;
        braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        i++;
      }
    } else if (type === 'method') {
      // Для методов аналогично
      let braceCount = (startLine.match(/\{/g) || []).length - (startLine.match(/\}/g) || []).length;
      let i = startIndex + 1;
      
      // Абстрактные методы могут заканчиваться точкой с запятой
      if (startLine.includes(';') && !startLine.includes('{')) {
        return code; // Абстрактный метод
      }
      
      while (i < lines.length && !lines[i].includes('{') && !lines[i].includes(';')) {
        code += '\n' + lines[i];
        i++;
      }
      
      if (i < lines.length) {
        code += '\n' + lines[i];
        if (lines[i].includes(';')) {
          return code; // Абстрактный метод
        }
        braceCount = (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
        i++;
      }
      
      while (i < lines.length && braceCount > 0) {
        const line = lines[i];
        code += '\n' + line;
        braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        i++;
      }
    }
    
    return code;
  }

  // Вспомогательные методы для Tree-sitter

  extractModifiers(node) {
    const modifiers = [];
    for (const child of node.children) {
      if (child.type === 'modifiers') {
        for (const modifier of child.children) {
          modifiers.push(modifier.text);
        }
      }
    }
    return modifiers;
  }

  hasModifier(node, modifierName) {
    return this.extractModifiers(node).includes(modifierName);
  }

  findParentClassName(node) {
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'class_declaration' || parent.type === 'enum_declaration') {
        const nameNode = parent.childForFieldName('name');
        return nameNode?.text;
      }
      parent = parent.parent;
    }
    return null;
  }

  extractSuperclass(node) {
    const superclassNode = node.childForFieldName('superclass');
    return superclassNode?.text || null;
  }

  extractImplementedInterfaces(node) {
    const interfacesNode = node.childForFieldName('interfaces');
    if (!interfacesNode) return [];

    const interfaces = [];
    for (const child of interfacesNode.children) {
      if (child.type === 'type_identifier') {
        interfaces.push(child.text);
      }
    }
    return interfaces;
  }

  extractExtendedInterfaces(node) {
    const extendsNode = node.childForFieldName('extends');
    if (!extendsNode) return [];

    const interfaces = [];
    for (const child of extendsNode.children) {
      if (child.type === 'type_identifier') {
        interfaces.push(child.text);
      }
    }
    return interfaces;
  }

  extractTypeParameters(node) {
    const typeParamsNode = node.childForFieldName('type_parameters');
    if (!typeParamsNode) return [];

    const params = [];
    for (const child of typeParamsNode.children) {
      if (child.type === 'type_parameter') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          params.push(nameNode.text);
        }
      }
    }
    return params;
  }

  extractAnnotations(node) {
    const annotations = [];
    
    // Ищем аннотации перед узлом
    let prev = node.previousSibling;
    while (prev && prev.type === 'annotation') {
      annotations.unshift(prev.text);
      prev = prev.previousSibling;
    }
    
    return annotations;
  }

  extractReturnType(node) {
    const typeNode = node.childForFieldName('type');
    return typeNode?.text || 'void';
  }

  extractMethodParameters(node) {
    const parametersNode = node.childForFieldName('parameters');
    if (!parametersNode) return [];

    const params = [];
    for (const child of parametersNode.children) {
      if (child.type === 'formal_parameter') {
        const typeNode = child.childForFieldName('type');
        const nameNode = child.childForFieldName('name');
        
        if (nameNode && typeNode) {
          params.push({
            name: nameNode.text,
            type: typeNode.text,
            annotations: this.extractParameterAnnotations(child)
          });
        }
      }
    }
    return params;
  }

  extractParameterAnnotations(paramNode) {
    const annotations = [];
    for (const child of paramNode.children) {
      if (child.type === 'annotation') {
        annotations.push(child.text);
      }
    }
    return annotations;
  }

  extractThrowsClause(node) {
    const throwsNode = node.childForFieldName('throws');
    if (!throwsNode) return [];

    const exceptions = [];
    for (const child of throwsNode.children) {
      if (child.type === 'type_identifier') {
        exceptions.push(child.text);
      }
    }
    return exceptions;
  }

  extractEnumConstants(node) {
    const bodyNode = node.childForFieldName('body');
    if (!bodyNode) return [];

    const constants = [];
    for (const child of bodyNode.children) {
      if (child.type === 'enum_constant') {
        const nameNode = child.childForFieldName('name');
        if (nameNode) {
          constants.push(nameNode.text);
        }
      }
    }
    return constants;
  }

  extractJavaDoc(node, sourceCode) {
    // Ищем JavaDoc комментарий перед узлом
    const lines = sourceCode.split('\n');
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    
    let docLines = [];
    for (let i = startLine - 2; i >= 0; i--) {
      const line = lines[i].trim();
      if (line === '*/') {
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
}
