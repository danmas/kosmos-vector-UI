import { GoogleGenAI, Type } from "@google/genai";
import { FunctionMetadata, LogicAnalysisResponse, AiItem } from '../types';

const getClient = () => {
  // В Vite переменные окружения должны начинаться с VITE_ для доступа в клиентском коде
  // Также поддерживаем process.env.API_KEY для совместимости с серверным кодом
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || 
                  import.meta.env.VITE_API_KEY || 
                  (typeof process !== 'undefined' && process.env?.API_KEY)) as string | undefined;
  if (!apiKey) {
    console.error("API_KEY is missing. Set VITE_GEMINI_API_KEY or VITE_API_KEY in .env file");
    throw new Error("API Key missing");
  }
  return new GoogleGenAI({ apiKey });
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    logic: { 
      type: Type.STRING,
      description: "Формальное описание логики на русском языке: вызываемые функции, таблицы, условия."
    },
    graph: {
      type: Type.OBJECT,
      properties: {
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { 
                type: Type.STRING,
                enum: ['start', 'end', 'decision', 'process', 'db_call', 'exception']
              },
              label: { type: Type.STRING },
              details: { type: Type.STRING }
            },
            required: ['id', 'type', 'label']
          }
        },
        edges: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              from: { type: Type.STRING },
              to: { type: Type.STRING },
              label: { type: Type.STRING }
            },
            required: ['id', 'from', 'to']
          }
        }
      },
      required: ['nodes', 'edges']
    }
  },
  required: ['logic', 'graph']
};

/**
 * Анализирует логику функции из AiItem и возвращает граф потока управления
 * @param item - AiItem с l0_code для анализа
 * @returns Promise<LogicAnalysisResponse> - граф логики и текстовое описание
 */
export async function analyzeFunctionLogic(item: AiItem): Promise<LogicAnalysisResponse> {
  // Формируем FunctionMetadata из AiItem
  const metadata: FunctionMetadata = {
    body: item.l0_code,
    s_name: item.id,
    full_name: item.id,
    comment: item.l2_desc,
    called_functions: item.l1_deps
  };

  const prompt = `
    Проанализируй следующий исходный код функции и предоставь структурированный ответ.

    ИСХОДНЫЙ КОД:
    ${metadata.body}

    МЕТАДАННЫЕ:
    ${JSON.stringify({
      signature: metadata.signature,
      called_functions: metadata.called_functions,
      tables: metadata.select_from,
      function_name: metadata.s_name,
      description: metadata.comment
    }, null, 2)}

    ТВОЯ ЗАДАЧА СОСТОИТ ИЗ ДВУХ ЧАСТЕЙ:

    1. РАЗДЕЛ "logic" (Текстовое описание):
    - Опиши логику работы функции на РУССКОМ ЯЗЫКЕ.
    - Перечисли все вызываемые функции (используй полные имена, если они известны).
    - Укажи, какие таблицы читаются (SELECT) и в какие записываются данные (INSERT/UPDATE/DELETE).
    - Опиши все ветвления (if/else, switch) и циклы.
    - Описание должно быть формальным и точным.

    2. РАЗДЕЛ "graph" (Граф потока управления):
    Соблюдай строгие правила связей:
    - 'start': Начало функции. Ровно ОДНА исходящая связь.
    - 'decision': Развилка/условие. Минимум ДВЕ исходящие связи (например, "Да"/"Нет").
    - 'process': Обычное действие или вычисление. Один вход, один выход.
    - 'db_call': Операция с БД. Один вход, один выход (трактуется как процесс).
    - 'end' или 'exception': Точки выхода. Минимум один вход, НОЛЬ исходящих связей.

    Используй краткие и понятные метки (labels) для узлов и связей.
  `;

  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const result = JSON.parse(response.text);
    return result as LogicAnalysisResponse;
  } catch (error) {
    console.error("Error analyzing code logic:", error);
    throw error;
  }
}

/**
 * Анализирует логику функции из FunctionMetadata (для ручного ввода JSON)
 * @param metadata - FunctionMetadata с body и опциональными полями
 * @returns Promise<LogicAnalysisResponse> - граф логики и текстовое описание
 */
export async function analyzeFunctionLogicFromMetadata(metadata: FunctionMetadata): Promise<LogicAnalysisResponse> {
  const prompt = `
    Проанализируй следующий исходный код функции и предоставь структурированный ответ.

    ИСХОДНЫЙ КОД:
    ${metadata.body}

    МЕТАДАННЫЕ:
    ${JSON.stringify({
      signature: metadata.signature,
      called_functions: metadata.called_functions,
      tables: metadata.select_from
    }, null, 2)}

    ТВОЯ ЗАДАЧА СОСТОИТ ИЗ ДВУХ ЧАСТЕЙ:

    1. РАЗДЕЛ "logic" (Текстовое описание):
    - Опиши логику работы функции на РУССКОМ ЯЗЫКЕ.
    - Перечисли все вызываемые функции (используй полные имена, если они известны).
    - Укажи, какие таблицы читаются (SELECT) и в какие записываются данные (INSERT/UPDATE/DELETE).
    - Опиши все ветвления (if/else, switch) и циклы.
    - Описание должно быть формальным и точным.

    2. РАЗДЕЛ "graph" (Граф потока управления):
    Соблюдай строгие правила связей:
    - 'start': Начало функции. Ровно ОДНА исходящая связь.
    - 'decision': Развилка/условие. Минимум ДВЕ исходящие связи (например, "Да"/"Нет").
    - 'process': Обычное действие или вычисление. Один вход, один выход.
    - 'db_call': Операция с БД. Один вход, один выход (трактуется как процесс).
    - 'end' или 'exception': Точки выхода. Минимум один вход, НОЛЬ исходящих связей.

    Используй краткие и понятные метки (labels) для узлов и связей.
  `;

  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const result = JSON.parse(response.text);
    return result as LogicAnalysisResponse;
  } catch (error) {
    console.error("Error analyzing code logic:", error);
    throw error;
  }
}

