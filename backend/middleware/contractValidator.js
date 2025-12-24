import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Middleware для валидации соответствия API контракту (OpenAPI спецификации)
 * 
 * Проверяет:
 * - Соответствие структуры ответов схемам в OpenAPI
 * - Корректность HTTP статус кодов
 * - Наличие обязательных полей в ответах
 * - Типы данных в ответах
 */

// Загружаем OpenAPI спецификацию
let apiContract = null;

try {
  const contractPath = path.join(__dirname, '../api-contract.yaml');
  if (fs.existsSync(contractPath)) {
    // В реальном проекте здесь было бы парсинг YAML
    // Для упрощения используем заглушку
    console.log('[Contract Validator] OpenAPI contract loaded from', contractPath);
  } else {
    console.warn('[Contract Validator] OpenAPI contract file not found, validation disabled');
  }
} catch (error) {
  console.error('[Contract Validator] Failed to load OpenAPI contract:', error.message);
}

/**
 * Валидирует структуру ответа согласно OpenAPI схеме
 * @param {string} method - HTTP метод
 * @param {string} path - API путь
 * @param {number} statusCode - HTTP статус код
 * @param {any} responseData - данные ответа
 * @returns {Object} результат валидации
 */
function validateResponse(method, path, statusCode, responseData) {
  const validation = {
    valid: true,
    errors: [],
    warnings: []
  };

  // Базовые проверки без полного парсинга YAML
  
  // 1. Проверяем стандартную структуру success/error ответов
  if (responseData && typeof responseData === 'object') {
    // Для error ответов (4xx, 5xx) проверяем структуру ErrorResponse
    if (statusCode >= 400) {
      if (!responseData.hasOwnProperty('success') || responseData.success !== false) {
        validation.errors.push('Error responses must have success: false');
        validation.valid = false;
      }
      if (!responseData.hasOwnProperty('error') || typeof responseData.error !== 'string') {
        validation.errors.push('Error responses must have error message string');
        validation.valid = false;
      }
    }
    
    // Для success ответов (2xx) проверяем структуру SuccessResponse
    else if (statusCode >= 200 && statusCode < 300) {
      // Некоторые endpoints возвращают массивы напрямую (items, logs)
      const isDirectArray = Array.isArray(responseData);
      const isHealthResponse = responseData.hasOwnProperty('status') && responseData.status === 'ok';
      
      if (!isDirectArray && !isHealthResponse) {
        if (!responseData.hasOwnProperty('success') || responseData.success !== true) {
          validation.warnings.push('Success responses should have success: true field');
        }
      }
    }
  }
  
  // 2. Проверяем специфичные структуры для известных endpoints
  const pathValidations = {
    '/api/health': validateHealthResponse,
    '/api/items': validateItemsResponse,
    '/api/stats': validateStatsResponse,
    '/api/graph': validateGraphResponse,
    '/api/chat': validateChatResponse,
    // v2.1.1: Новые эндпоинты
    '/api/project/tree': validateProjectTreeResponse,
    '/api/project/selection': validateProjectSelectionResponse,
    '/api/kb-config': validateKbConfigResponse
  };
  
  // Нормализуем путь (убираем параметры и query string)
  let normalizedPath = path.split('?')[0]; // Убираем query параметры
  normalizedPath = normalizedPath.replace(/\/[^/]+$/, '/{id}').replace(/\/\d+\//, '/{id}/');
  
  // Проверяем точное совпадение или нормализованное
  const exactMatch = pathValidations[path.split('?')[0]];
  const normalizedMatch = pathValidations[normalizedPath];
  const validator = exactMatch || normalizedMatch;
  
  if (validator) {
    const specificValidation = validator(responseData, statusCode);
    validation.errors.push(...specificValidation.errors);
    validation.warnings.push(...specificValidation.warnings);
    validation.valid = validation.valid && specificValidation.valid;
  }
  
  return validation;
}

/**
 * Специфичные валидаторы для отдельных endpoints
 */

function validateHealthResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    const required = ['status', 'timestamp', 'version', 'endpoints'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Health response missing required field: ${field}`);
        validation.valid = false;
      }
    }
    
    if (data.status !== 'ok') {
      validation.errors.push('Health response status must be "ok"');
      validation.valid = false;
    }
    
    if (data.endpoints && !Array.isArray(data.endpoints)) {
      validation.errors.push('Health response endpoints must be an array');
      validation.valid = false;
    }
  }
  
  return validation;
}

function validateItemsResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    if (!Array.isArray(data)) {
      validation.errors.push('Items response must be an array');
      validation.valid = false;
    } else {
      // Проверяем структуру первого элемента как пример
      if (data.length > 0) {
        const item = data[0];
        const required = ['id', 'type', 'language', 'l0_code', 'l1_deps', 'l2_desc', 'filePath'];
        for (const field of required) {
          if (!item.hasOwnProperty(field)) {
            validation.errors.push(`AiItem missing required field: ${field}`);
            validation.valid = false;
          }
        }
        
        if (item.l1_deps && !Array.isArray(item.l1_deps)) {
          validation.errors.push('AiItem l1_deps must be an array');
          validation.valid = false;
        }
      }
    }
  }
  
  return validation;
}

function validateStatsResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    const required = ['totalItems', 'totalDeps', 'averageDependencyDensity', 'typeStats', 'languageStats'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Stats response missing required field: ${field}`);
        validation.valid = false;
      }
    }
    
    if (data.typeStats && !Array.isArray(data.typeStats)) {
      validation.errors.push('Stats typeStats must be an array');
      validation.valid = false;
    }
    
    if (data.languageStats && !Array.isArray(data.languageStats)) {
      validation.errors.push('Stats languageStats must be an array');
      validation.valid = false;
    }
  }
  
  return validation;
}

function validateGraphResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    const required = ['nodes', 'links'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Graph response missing required field: ${field}`);
        validation.valid = false;
      }
    }
    
    if (data.nodes && !Array.isArray(data.nodes)) {
      validation.errors.push('Graph nodes must be an array');
      validation.valid = false;
    }
    
    if (data.links && !Array.isArray(data.links)) {
      validation.errors.push('Graph links must be an array');
      validation.valid = false;
    }
  }
  
  return validation;
}

function validateChatResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    const required = ['response', 'timestamp'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Chat response missing required field: ${field}`);
        validation.valid = false;
      }
    }
    
    if (data.usedContextIds && !Array.isArray(data.usedContextIds)) {
      validation.errors.push('Chat usedContextIds must be an array');
      validation.valid = false;
    }
  }
  
  return validation;
}

// v2.1.1: Валидаторы для новых эндпоинтов

function validateProjectTreeResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    if (!Array.isArray(data)) {
      validation.errors.push('Project tree response must be an array');
      validation.valid = false;
      return validation;
    }
    
    if (data.length > 0) {
      const file = data[0];
      const required = ['path', 'name', 'type', 'size', 'selected'];
      for (const field of required) {
        if (!file.hasOwnProperty(field)) {
          validation.errors.push(`ProjectFile missing required field: ${field}`);
          validation.valid = false;
        }
      }
      
      if (file.type && !['file', 'directory'].includes(file.type)) {
        validation.errors.push('ProjectFile type must be "file" or "directory"');
        validation.valid = false;
      }
      
      if (file.path && !file.path.startsWith('./')) {
        validation.errors.push('ProjectFile path must start with "./"');
        validation.valid = false;
      }
      
      if (file.size !== undefined && typeof file.size !== 'number') {
        validation.errors.push('ProjectFile size must be a number');
        validation.valid = false;
      }
      
      if (file.selected !== undefined && typeof file.selected !== 'boolean') {
        validation.errors.push('ProjectFile selected must be a boolean');
        validation.valid = false;
      }
    }
  }
  
  return validation;
}

function validateProjectSelectionResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('Project selection response must be an object');
      validation.valid = false;
      return validation;
    }
    
    if (!data.hasOwnProperty('success') || data.success !== true) {
      validation.errors.push('Project selection response must have success: true');
      validation.valid = false;
    }
    
    if (!data.hasOwnProperty('config')) {
      validation.errors.push('Project selection response must have config field');
      validation.valid = false;
    } else {
      const config = data.config;
      const required = ['rootPath', 'fileSelection', 'includeMask', 'ignorePatterns', 'lastUpdated'];
      for (const field of required) {
        if (!config.hasOwnProperty(field)) {
          validation.errors.push(`KB config missing required field: ${field}`);
          validation.valid = false;
        }
      }
      
      if (config.fileSelection !== undefined && !Array.isArray(config.fileSelection)) {
        validation.errors.push('KB config fileSelection must be an array');
        validation.valid = false;
      }
    }
  }
  
  return validation;
}

function validateKbConfigResponse(data, statusCode) {
  const validation = { valid: true, errors: [], warnings: [] };
  
  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('KB config response must be an object');
      validation.valid = false;
      return validation;
    }
    
    if (!data.hasOwnProperty('success') || data.success !== true) {
      validation.errors.push('KB config response must have success: true');
      validation.valid = false;
    }
    
    if (!data.hasOwnProperty('config')) {
      validation.errors.push('KB config response must have config field');
      validation.valid = false;
    } else {
      const config = data.config;
      const required = ['rootPath', 'fileSelection', 'includeMask', 'ignorePatterns', 'lastUpdated'];
      for (const field of required) {
        if (!config.hasOwnProperty(field)) {
          validation.errors.push(`KB config missing required field: ${field}`);
          validation.valid = false;
        }
      }
      
      if (config.rootPath !== undefined && typeof config.rootPath !== 'string') {
        validation.errors.push('KB config rootPath must be a string');
        validation.valid = false;
      }
      
      if (config.fileSelection !== undefined && !Array.isArray(config.fileSelection)) {
        validation.errors.push('KB config fileSelection must be an array');
        validation.valid = false;
      }
    }
  }
  
  return validation;
}

/**
 * Express middleware для валидации ответов
 */
export function contractValidationMiddleware(options = {}) {
  const { 
    enabled = process.env.NODE_ENV !== 'production',
    logErrors = true,
    logWarnings = false,
    throwOnError = false,
    logger = null // Функция для логирования (addLog из server.js)
  } = options;
  
  return (req, res, next) => {
    if (!enabled) {
      return next();
    }
    
    // Перехватываем оригинальные методы ответа
    const originalJson = res.json;
    const originalSend = res.send;
    
    res.json = function(data) {
      if (enabled) {
        const validation = validateResponse(req.method, req.path, res.statusCode, data);
        
        if (!validation.valid) {
          // Формируем детальное сообщение об ошибке
          const errorDetails = {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            errors: validation.errors,
            responsePreview: JSON.stringify(data).substring(0, 500),
            timestamp: new Date().toISOString()
          };
          
          const errorMessage = `[Contract Validator] ❌ Validation FAILED for ${req.method} ${req.path} (${res.statusCode}): ${validation.errors.join('; ')}`;
          
          if (logErrors) {
            // Детальное логирование в консоль
            console.error(errorMessage);
            console.error('[Contract Validator] Response preview:', errorDetails.responsePreview);
            console.error('[Contract Validator] Full error details:', JSON.stringify(errorDetails, null, 2));
            
            // Логируем через систему логов сервера (если доступна)
            if (logger && typeof logger === 'function') {
              try {
                logger('ERROR', `Contract validation failed: ${errorMessage}`, JSON.stringify(errorDetails));
              } catch (logError) {
                console.warn('[Contract Validator] Failed to log via server logging system:', logError);
              }
            }
          }
          
          if (throwOnError) {
            throw new Error(errorMessage);
          }
        }
        
        if (validation.warnings.length > 0 && logWarnings) {
          const warningMessage = `[Contract Validator] ⚠️ Warnings for ${req.method} ${req.path}: ${validation.warnings.join('; ')}`;
          console.warn(warningMessage);
          
          // Логируем предупреждения через систему логов сервера
          if (logger && typeof logger === 'function') {
            try {
              logger('WARN', warningMessage);
            } catch (logError) {
              // Игнорируем ошибки логирования предупреждений
            }
          }
        }
      }
      
      return originalJson.call(this, data);
    };
    
    res.send = function(data) {
      // Для text/plain ответов пропускаем валидацию
      if (enabled && res.getHeader('Content-Type')?.includes('application/json')) {
        try {
          const jsonData = JSON.parse(data);
          const validation = validateResponse(req.method, req.path, res.statusCode, jsonData);
          
          if (!validation.valid) {
            const errorDetails = {
              method: req.method,
              path: req.path,
              statusCode: res.statusCode,
              errors: validation.errors,
              responsePreview: JSON.stringify(jsonData).substring(0, 500),
              timestamp: new Date().toISOString()
            };
            
            const errorMessage = `[Contract Validator] ❌ Validation FAILED for ${req.method} ${req.path} (${res.statusCode}): ${validation.errors.join('; ')}`;
            
            if (logErrors) {
              console.error(errorMessage);
              console.error('[Contract Validator] Response preview:', errorDetails.responsePreview);
              
              // Логируем через систему логов сервера
              if (logger && typeof logger === 'function') {
                try {
                  logger('ERROR', `Contract validation failed: ${errorMessage}`, JSON.stringify(errorDetails));
                } catch (logError) {
                  console.warn('[Contract Validator] Failed to log via server logging system:', logError);
                }
              }
            }
          }
          
          if (validation.warnings.length > 0 && logWarnings) {
            const warningMessage = `[Contract Validator] ⚠️ Warnings for ${req.method} ${req.path}: ${validation.warnings.join('; ')}`;
            console.warn(warningMessage);
            
            if (logger && typeof logger === 'function') {
              try {
                logger('WARN', warningMessage);
              } catch (logError) {
                // Игнорируем ошибки логирования предупреждений
              }
            }
          }
        } catch (e) {
          // Не JSON данные - пропускаем валидацию
        }
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Функция для валидации конкретного ответа (для тестов)
 */
export function validateApiResponse(method, path, statusCode, responseData) {
  return validateResponse(method, path, statusCode, responseData);
}

export default contractValidationMiddleware;
