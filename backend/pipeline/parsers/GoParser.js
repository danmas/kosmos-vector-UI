import { BaseParser } from './BaseParser.js';
import Parser from 'tree-sitter';

/**
 * Парсер для Go файлов
 */
export class GoParser extends BaseParser {
  constructor(config) {
    super(config);
    this.language = 'go';
    this.parser = null;
  }

  /**
   * Инициализация Tree-sitter парсера для Go
   */
  async initializeParser() {
    if (!this.parser) {
      try {
        // Попытка загрузить tree-sitter-go
        const Go = await import('tree-sitter-go');
        this.parser = new Parser();
        this.parser.setLanguage(Go.default);
      } catch (error) {
        console.warn('Tree-sitter-go not available, falling back to regex parser');
        this.parser = null;
      }
    }
  }

  /**
   * Парсинг Go файла
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
      case 'function_declaration':
        this.handleFunction(node, sourceCode, filePath, aiItems);
        break;
        
      case 'method_declaration':
        this.handleMethod(node, sourceCode, filePath, aiItems);
        break;
        
      case 'type_declaration':
        this.handleTypeDeclaration(node, sourceCode, filePath, aiItems);
        break;
        
      case 'var_declaration':
      case 'const_declaration':
        this.handleVariableDeclaration(node, sourceCode, filePath, aiItems);
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
    
    const aiItem = this.createAiItem(
      id,
      'function',
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    // Метаданные для Go функций
    aiItem.metadata.isExported = this.isExported(name);
    aiItem.metadata.parameters = this.extractFunctionParameters(node);
    aiItem.metadata.returnTypes = this.extractReturnTypes(node);
    aiItem.metadata.comments = this.extractGoDoc(node, sourceCode);

    aiItems.push(aiItem);
  }

  /**
   * Обработка методов
   */
  handleMethod(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;

    const name = nameNode.text;
    const receiverNode = node.childForFieldName('receiver');
    const receiverType = this.extractReceiverType(receiverNode);
    
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    const fullName = receiverType ? `${receiverType}.${name}` : name;
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

    // Метаданные для Go методов
    aiItem.metadata.receiverType = receiverType;
    aiItem.metadata.isPointerReceiver = this.isPointerReceiver(receiverNode);
    aiItem.metadata.isExported = this.isExported(name);
    aiItem.metadata.parameters = this.extractFunctionParameters(node);
    aiItem.metadata.returnTypes = this.extractReturnTypes(node);
    aiItem.metadata.comments = this.extractGoDoc(node, sourceCode);

    aiItems.push(aiItem);
  }

  /**
   * Обработка объявлений типов
   */
  handleTypeDeclaration(node, sourceCode, filePath, aiItems) {
    // Go может иметь несколько типов в одном объявлении
    for (const child of node.children) {
      if (child.type === 'type_spec') {
        this.handleTypeSpec(child, sourceCode, filePath, aiItems);
      }
    }
  }

  /**
   * Обработка спецификации типа
   */
  handleTypeSpec(node, sourceCode, filePath, aiItems) {
    const nameNode = node.childForFieldName('name');
    const typeNode = node.childForFieldName('type');
    
    if (!nameNode || !typeNode) return;

    const name = nameNode.text;
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    const endLine = this.getLineNumber(sourceCode, node.endPosition);
    const code = this.extractCodeByPosition(sourceCode, node.startPosition, node.endPosition);
    
    // Определяем тип на основе AST
    let itemType = 'type';
    if (typeNode.type === 'struct_type') {
      itemType = 'struct';
    } else if (typeNode.type === 'interface_type') {
      itemType = 'interface';
    }
    
    const id = this.createUniqueId(filePath, itemType, name, startLine);
    
    const aiItem = this.createAiItem(
      id,
      itemType,
      this.language,
      filePath,
      code,
      startLine,
      endLine
    );

    // Метаданные для Go типов
    aiItem.metadata.isExported = this.isExported(name);
    aiItem.metadata.underlyingType = typeNode.type;
    
    if (itemType === 'struct') {
      aiItem.metadata.fields = this.extractStructFields(typeNode);
    } else if (itemType === 'interface') {
      aiItem.metadata.methods = this.extractInterfaceMethods(typeNode);
    }
    
    aiItem.metadata.comments = this.extractGoDoc(node.parent, sourceCode);

    aiItems.push(aiItem);
  }

  /**
   * Обработка объявлений переменных и констант
   */
  handleVariableDeclaration(node, sourceCode, filePath, aiItems) {
    // В Go переменные обычно не считаются значимыми элементами архитектуры
    // но можем захватывать публичные константы
    if (node.type === 'const_declaration') {
      for (const child of node.children) {
        if (child.type === 'const_spec') {
          const nameNode = child.childForFieldName('name');
          if (nameNode && this.isExported(nameNode.text)) {
            // Можем добавить публичные константы
          }
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

    // Паттерны для Go конструкций
    const patterns = {
      function: /^\s*func\s+(\w+)\s*\(/,
      method: /^\s*func\s*\([^)]+\)\s*(\w+)\s*\(/,
      struct: /^\s*type\s+(\w+)\s+struct/,
      interface: /^\s*type\s+(\w+)\s+interface/,
      type: /^\s*type\s+(\w+)\s+\w+/
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      for (const [type, pattern] of Object.entries(patterns)) {
        const match = line.match(pattern);
        if (match) {
          const name = match[1];
          const code = this.extractGoConstruct(lines, i, type);
          const endLineNumber = i + code.split('\n').length;
          
          const id = this.createUniqueId(filePath, type, name, lineNumber);

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
          aiItem.metadata.isExported = this.isExported(name);

          aiItems.push(aiItem);
          break;
        }
      }
    }

    return aiItems;
  }

  /**
   * Извлечь Go конструкцию (функция, struct, interface)
   */
  extractGoConstruct(lines, startIndex, type) {
    const startLine = lines[startIndex];
    let code = startLine;
    
    if (type === 'function' || type === 'method') {
      // Для функций ищем открывающую скобку и соответствующую закрывающую
      let braceCount = (startLine.match(/\{/g) || []).length - (startLine.match(/\}/g) || []).length;
      let i = startIndex + 1;
      
      // Если скобка не на той же строке, ищем её
      if (braceCount === 0) {
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
    } else {
      // Для типов (struct, interface) аналогично
      let braceCount = (startLine.match(/\{/g) || []).length - (startLine.match(/\}/g) || []).length;
      let i = startIndex + 1;
      
      while (i < lines.length && braceCount > 0) {
        const line = lines[i];
        code += '\n' + line;
        braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        i++;
      }
    }
    
    return code;
  }

  // Вспомогательные методы

  /**
   * Проверить, экспортирован ли идентификатор (начинается с заглавной буквы)
   */
  isExported(name) {
    return name && name[0] === name[0].toUpperCase();
  }

  /**
   * Извлечь параметры функции
   */
  extractFunctionParameters(node) {
    const parametersNode = node.childForFieldName('parameters');
    if (!parametersNode) return [];

    const params = [];
    for (const child of parametersNode.children) {
      if (child.type === 'parameter_declaration') {
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');
        
        if (nameNode) {
          params.push({
            name: nameNode.text,
            type: typeNode?.text || 'unknown'
          });
        }
      }
    }
    
    return params;
  }

  /**
   * Извлечь типы возвращаемых значений
   */
  extractReturnTypes(node) {
    const resultNode = node.childForFieldName('result');
    if (!resultNode) return [];

    const types = [];
    if (resultNode.type === 'parameter_list') {
      for (const child of resultNode.children) {
        if (child.type === 'parameter_declaration') {
          const typeNode = child.childForFieldName('type');
          if (typeNode) {
            types.push(typeNode.text);
          }
        }
      }
    } else {
      // Простой тип возврата
      types.push(resultNode.text);
    }
    
    return types;
  }

  /**
   * Извлечь тип получателя метода
   */
  extractReceiverType(receiverNode) {
    if (!receiverNode) return null;

    for (const child of receiverNode.children) {
      if (child.type === 'parameter_declaration') {
        const typeNode = child.childForFieldName('type');
        if (typeNode) {
          // Убираем указатель, если есть
          return typeNode.text.replace(/^\*/, '');
        }
      }
    }
    
    return null;
  }

  /**
   * Проверить, является ли получатель указателем
   */
  isPointerReceiver(receiverNode) {
    if (!receiverNode) return false;

    for (const child of receiverNode.children) {
      if (child.type === 'parameter_declaration') {
        const typeNode = child.childForFieldName('type');
        return typeNode?.text.startsWith('*') || false;
      }
    }
    
    return false;
  }

  /**
   * Извлечь поля структуры
   */
  extractStructFields(structNode) {
    const fields = [];
    
    for (const child of structNode.children) {
      if (child.type === 'field_declaration') {
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');
        const tagNode = child.childForFieldName('tag');
        
        if (nameNode && typeNode) {
          fields.push({
            name: nameNode.text,
            type: typeNode.text,
            tag: tagNode?.text || null,
            isExported: this.isExported(nameNode.text)
          });
        }
      }
    }
    
    return fields;
  }

  /**
   * Извлечь методы интерфейса
   */
  extractInterfaceMethods(interfaceNode) {
    const methods = [];
    
    for (const child of interfaceNode.children) {
      if (child.type === 'method_spec') {
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');
        
        if (nameNode) {
          methods.push({
            name: nameNode.text,
            signature: typeNode?.text || '',
            isExported: this.isExported(nameNode.text)
          });
        }
      }
    }
    
    return methods;
  }

  /**
   * Извлечь GoDoc комментарии
   */
  extractGoDoc(node, sourceCode) {
    // Ищем комментарии перед узлом
    const lines = sourceCode.split('\n');
    const startLine = this.getLineNumber(sourceCode, node.startPosition);
    
    let docLines = [];
    for (let i = startLine - 2; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('//')) {
        docLines.unshift(line);
      } else if (line.startsWith('/*') && line.endsWith('*/')) {
        docLines.unshift(line);
      } else if (line.startsWith('/*')) {
        // Многострочный комментарий
        let j = i;
        let comment = '';
        while (j >= 0 && !lines[j].includes('*/')) {
          comment = lines[j] + '\n' + comment;
          j--;
        }
        if (j >= 0) {
          comment = lines[j] + '\n' + comment;
          docLines.unshift(comment.trim());
        }
        break;
      } else if (!line) {
        continue; // Пропускаем пустые строки
      } else {
        break; // Прерываем на первой не-комментарии
      }
    }
    
    return docLines.length > 0 ? docLines.join('\n') : null;
  }
}
