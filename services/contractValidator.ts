/**
 * Клиентская валидация соответствия API контракту
 * Проверяет структуру ответов API перед использованием
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Валидирует ответ API согласно контракту
 */
export function validateApiResponse(
  method: string,
  path: string,
  statusCode: number,
  responseData: any
): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  // Нормализуем путь (убираем query параметры)
  const normalizedPath = path.split('?')[0];

  // 1. Проверяем структуру ошибок (4xx, 5xx)
  if (statusCode >= 400) {
    if (!responseData || typeof responseData !== 'object') {
      validation.errors.push('Error response must be an object');
      validation.valid = false;
      return validation;
    }

    if (!responseData.hasOwnProperty('success') || responseData.success !== false) {
      validation.errors.push('Error responses must have success: false');
      validation.valid = false;
    }

    if (!responseData.hasOwnProperty('error') || typeof responseData.error !== 'string') {
      validation.errors.push('Error responses must have error message string');
      validation.valid = false;
    }
  }

  // 2. Проверяем специфичные структуры для успешных ответов (2xx)
  if (statusCode >= 200 && statusCode < 300) {
    const specificValidation = validateEndpointResponse(normalizedPath, responseData, statusCode);
    validation.errors.push(...specificValidation.errors);
    validation.warnings.push(...specificValidation.warnings);
    validation.valid = validation.valid && specificValidation.valid;
  }

  return validation;
}

/**
 * Валидирует ответ конкретного endpoint
 */
function validateEndpointResponse(
  path: string,
  data: any,
  statusCode: number
): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  switch (path) {
    case '/api/files':
      return validateFilesResponse(data, statusCode);
    case '/api/stats':
      return validateStatsResponse(data, statusCode);
    case '/api/health':
      return validateHealthResponse(data, statusCode);
    case '/api/items':
      return validateItemsResponse(data, statusCode);
    case '/api/graph':
      return validateGraphResponse(data, statusCode);
    case '/api/chat':
      return validateChatResponse(data, statusCode);
    // v2.1.1: Новые эндпоинты
    case '/api/project/tree':
      return validateProjectTreeResponse(data, statusCode);
    case '/api/project/selection':
      return validateProjectSelectionResponse(data, statusCode);
    case '/api/kb-config':
      return validateKbConfigResponse(data, statusCode);
    default:
      // Для неизвестных endpoints делаем базовую проверку
      return validation;
  }
}

/**
 * Валидатор для /api/files - возвращает массив FileNode
 */
function validateFilesResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!Array.isArray(data)) {
      validation.errors.push('Files response must be an array');
      validation.valid = false;
      return validation;
    }

    // Проверяем структуру первого элемента как пример
    if (data.length > 0) {
      const node = data[0];
      const required = ['id', 'name', 'type'];
      for (const field of required) {
        if (!node.hasOwnProperty(field)) {
          validation.errors.push(`FileNode missing required field: ${field}`);
          validation.valid = false;
        }
      }

      // Проверяем тип
      if (node.type && !['file', 'folder'].includes(node.type)) {
        validation.errors.push('FileNode type must be "file" or "folder"');
        validation.valid = false;
      }

      // Если есть children, проверяем что это массив
      if (node.hasOwnProperty('children') && !Array.isArray(node.children)) {
        validation.errors.push('FileNode children must be an array');
        validation.valid = false;
      }
    }
  }

  return validation;
}

/**
 * Валидатор для /api/stats - возвращает DashboardStats
 */
function validateStatsResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('Stats response must be an object');
      validation.valid = false;
      return validation;
    }

    const required = ['totalItems', 'totalDeps', 'averageDependencyDensity', 'typeStats', 'languageStats'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Stats response missing required field: ${field}`);
        validation.valid = false;
      }
    }

    // Проверяем typeStats
    if (data.typeStats !== undefined) {
      if (!Array.isArray(data.typeStats)) {
        validation.errors.push('Stats typeStats must be an array');
        validation.valid = false;
      } else if (data.typeStats.length > 0) {
        const stat = data.typeStats[0];
        if (!stat.hasOwnProperty('name') || !stat.hasOwnProperty('count')) {
          validation.errors.push('TypeStat must have name and count fields');
          validation.valid = false;
        }
      }
    }

    // Проверяем languageStats
    if (data.languageStats !== undefined) {
      if (!Array.isArray(data.languageStats)) {
        validation.errors.push('Stats languageStats must be an array');
        validation.valid = false;
      } else if (data.languageStats.length > 0) {
        const stat = data.languageStats[0];
        if (!stat.hasOwnProperty('name') || !stat.hasOwnProperty('value')) {
          validation.errors.push('LanguageStat must have name and value fields');
          validation.valid = false;
        }
      }
    }
  }

  return validation;
}

/**
 * Валидатор для /api/health - возвращает HealthResponse
 */
function validateHealthResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('Health response must be an object');
      validation.valid = false;
      return validation;
    }

    const required = ['status', 'timestamp', 'version', 'endpoints'];
    for (const field of required) {
      if (!data.hasOwnProperty(field)) {
        validation.errors.push(`Health response missing required field: ${field}`);
        validation.valid = false;
      }
    }

    if (data.status && data.status !== 'ok') {
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

/**
 * Валидатор для /api/items - возвращает массив AiItem
 */
function validateItemsResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!Array.isArray(data)) {
      validation.errors.push('Items response must be an array');
      validation.valid = false;
      return validation;
    }

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

  return validation;
}

/**
 * Валидатор для /api/graph - возвращает GraphData
 */
function validateGraphResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('Graph response must be an object');
      validation.valid = false;
      return validation;
    }

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

/**
 * Валидатор для /api/chat - возвращает ChatResponse
 */
function validateChatResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('Chat response must be an object');
      validation.valid = false;
      return validation;
    }

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

/**
 * Валидатор для /api/project/tree - возвращает массив ProjectFile (v2.1.1)
 */
function validateProjectTreeResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!Array.isArray(data)) {
      validation.errors.push('Project tree response must be an array');
      validation.valid = false;
      return validation;
    }

    // Проверяем структуру первого элемента как пример
    if (data.length > 0) {
      const file = data[0];
      const required = ['path', 'name', 'type', 'size', 'selected'];
      for (const field of required) {
        if (!file.hasOwnProperty(field)) {
          validation.errors.push(`ProjectFile missing required field: ${field}`);
          validation.valid = false;
        }
      }

      // Проверяем тип
      if (file.type && !['file', 'directory'].includes(file.type)) {
        validation.errors.push('ProjectFile type must be "file" or "directory"');
        validation.valid = false;
      }

      // Проверяем path начинается с ./
      if (file.path && !file.path.startsWith('./')) {
        validation.errors.push('ProjectFile path must start with "./"');
        validation.valid = false;
      }

      // Проверяем size - число
      if (file.size !== undefined && typeof file.size !== 'number') {
        validation.errors.push('ProjectFile size must be a number');
        validation.valid = false;
      }

      // Проверяем selected - boolean
      if (file.selected !== undefined && typeof file.selected !== 'boolean') {
        validation.errors.push('ProjectFile selected must be a boolean');
        validation.valid = false;
      }

      // Если есть children, проверяем что это массив
      if (file.hasOwnProperty('children') && !Array.isArray(file.children)) {
        validation.errors.push('ProjectFile children must be an array');
        validation.valid = false;
      }

      // Проверяем language если есть (версия 2.1.2 - language теперь гибкое поле без enum)
      if (file.hasOwnProperty('language') && file.language !== null) {
        if (typeof file.language !== 'string') {
          validation.errors.push('ProjectFile language must be a string or null');
          validation.valid = false;
        }
      }
    }
  }

  return validation;
}

/**
 * Валидатор для /api/project/selection - возвращает SuccessResponse с config (v2.1.1)
 */
function validateProjectSelectionResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('Project selection response must be an object');
      validation.valid = false;
      return validation;
    }

    // Проверяем структуру SuccessResponse
    if (!data.hasOwnProperty('success') || data.success !== true) {
      validation.errors.push('Project selection response must have success: true');
      validation.valid = false;
    }

    if (!data.hasOwnProperty('message') || typeof data.message !== 'string') {
      validation.errors.push('Project selection response must have message string');
      validation.valid = false;
    }

    // Проверяем наличие config
    if (!data.hasOwnProperty('config')) {
      validation.errors.push('Project selection response must have config field');
      validation.valid = false;
    } else {
      // Валидируем структуру KnowledgeBaseConfig
      const config = data.config;
      const requiredConfigFields = ['rootPath', 'fileSelection', 'includeMask', 'ignorePatterns', 'lastUpdated'];
      for (const field of requiredConfigFields) {
        if (!config.hasOwnProperty(field)) {
          validation.errors.push(`KB config missing required field: ${field}`);
          validation.valid = false;
        }
      }

      // Проверяем fileSelection - массив строк
      if (config.fileSelection !== undefined) {
        if (!Array.isArray(config.fileSelection)) {
          validation.errors.push('KB config fileSelection must be an array');
          validation.valid = false;
        } else {
          // Проверяем что все пути начинаются с ./
          const invalidPaths = config.fileSelection.filter((path: any) => 
            typeof path !== 'string' || !path.startsWith('./')
          );
          if (invalidPaths.length > 0) {
            validation.errors.push(`KB config fileSelection contains invalid paths (must start with './'): ${invalidPaths.join(', ')}`);
            validation.valid = false;
          }
        }
      }
    }
  }

  return validation;
}

/**
 * Валидатор для /api/kb-config - возвращает SuccessResponse с config (v2.1.1)
 */
function validateKbConfigResponse(data: any, statusCode: number): ValidationResult {
  const validation: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (statusCode === 200) {
    if (!data || typeof data !== 'object') {
      validation.errors.push('KB config response must be an object');
      validation.valid = false;
      return validation;
    }

    // Проверяем структуру SuccessResponse
    if (!data.hasOwnProperty('success') || data.success !== true) {
      validation.errors.push('KB config response must have success: true');
      validation.valid = false;
    }

    // Проверяем наличие config
    if (!data.hasOwnProperty('config')) {
      validation.errors.push('KB config response must have config field');
      validation.valid = false;
    } else {
      // Валидируем структуру KnowledgeBaseConfig v2.1.1
      const config = data.config;
      const requiredConfigFields = ['rootPath', 'fileSelection', 'includeMask', 'ignorePatterns', 'lastUpdated'];
      for (const field of requiredConfigFields) {
        if (!config.hasOwnProperty(field)) {
          validation.errors.push(`KB config missing required field: ${field}`);
          validation.valid = false;
        }
      }

      // Проверяем типы полей
      if (config.rootPath !== undefined && typeof config.rootPath !== 'string') {
        validation.errors.push('KB config rootPath must be a string');
        validation.valid = false;
      }

      if (config.fileSelection !== undefined && !Array.isArray(config.fileSelection)) {
        validation.errors.push('KB config fileSelection must be an array');
        validation.valid = false;
      }

      if (config.includeMask !== undefined && typeof config.includeMask !== 'string') {
        validation.errors.push('KB config includeMask must be a string');
        validation.valid = false;
      }

      if (config.ignorePatterns !== undefined && typeof config.ignorePatterns !== 'string') {
        validation.errors.push('KB config ignorePatterns must be a string');
        validation.valid = false;
      }

      if (config.lastUpdated !== undefined && typeof config.lastUpdated !== 'string') {
        validation.errors.push('KB config lastUpdated must be a string (ISO date)');
        validation.valid = false;
      }
    }
  }

  return validation;
}


