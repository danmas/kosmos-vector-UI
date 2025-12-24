import { PythonParser } from './PythonParser.js';
import { TypeScriptParser } from './TypeScriptParser.js';
import { GoParser } from './GoParser.js';
import { JavaParser } from './JavaParser.js';

/**
 * Главный парсер, определяющий язык и делегирующий парсинг
 */
export class Parser {
  constructor(config) {
    this.config = config;
    this.parsers = new Map();
    this.initializeParsers();
  }

  /**
   * Инициализация парсеров для каждого языка
   */
  initializeParsers() {
    this.parsers.set('.py', new PythonParser(this.config));
    this.parsers.set('.ts', new TypeScriptParser(this.config));
    this.parsers.set('.tsx', new TypeScriptParser(this.config));
    this.parsers.set('.js', new TypeScriptParser(this.config)); // JS использует TS парсер
    this.parsers.set('.jsx', new TypeScriptParser(this.config));
    this.parsers.set('.go', new GoParser(this.config));
    this.parsers.set('.java', new JavaParser(this.config));
  }

  /**
   * Парсинг файла в зависимости от расширения
   */
  async parseFile(filePath) {
    const extension = this.getFileExtension(filePath);
    const parser = this.parsers.get(extension);
    
    if (!parser) {
      throw new Error(`No parser available for file extension: ${extension}`);
    }

    try {
      return await parser.parseFile(filePath);
    } catch (error) {
      throw new Error(`Failed to parse ${filePath}: ${error.message}`);
    }
  }

  /**
   * Получить расширение файла
   */
  getFileExtension(filePath) {
    return filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  }

  /**
   * Получить поддерживаемые расширения
   */
  getSupportedExtensions() {
    return Array.from(this.parsers.keys());
  }

  /**
   * Проверить поддержку файла
   */
  isSupported(filePath) {
    const extension = this.getFileExtension(filePath);
    return this.parsers.has(extension);
  }
}
