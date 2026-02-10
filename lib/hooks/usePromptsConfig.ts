import { useState, useEffect, useCallback } from 'react';
import { PromptsConfig } from '../../types';
import { apiClient } from '../../services/apiClient';

interface UsePromptsConfigReturn {
  config: PromptsConfig | null;
  loading: boolean;
  error: string | null;
  validationErrors: string[];
  updateConfig: (updates: Partial<PromptsConfig>, comment?: string) => Promise<boolean>;
  resetConfig: (comment?: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Хук для работы с Prompts Config API (v2.9.0)
 * Управление конфигурацией промптов LLM
 */
export function usePromptsConfig(): UsePromptsConfigReturn {
  const [config, setConfig] = useState<PromptsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Загрузить конфигурацию промптов
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('[usePromptsConfig] Loading config from /api/prompts-config...');
      const response = await apiClient.getPromptsConfig();
      console.log('[usePromptsConfig] Response received:', response);
      
      if (response.success) {
        console.log('[usePromptsConfig] Setting config:', response.prompts);
        setConfig(response.prompts);
      } else {
        console.error('[usePromptsConfig] Response not successful');
        setError('Failed to load prompts configuration');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load prompts config';
      setError(errorMessage);
      console.error('[usePromptsConfig] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Обновить конфигурацию промптов
  const updateConfig = useCallback(async (
    updates: Partial<PromptsConfig>,
    comment?: string
  ): Promise<boolean> => {
    try {
      setError(null);
      setValidationErrors([]);
      
      const response = await apiClient.updatePromptsConfig(updates, comment);
      
      if (response.success) {
        setConfig(response.config);
        console.log('[usePromptsConfig] Config updated successfully. Version:', response.historyEntry.version);
        return true;
      } else {
        setError('Failed to update prompts configuration');
        return false;
      }
    } catch (err: any) {
      // Обработка ошибок валидации
      if (err.status === 400 && err.data?.validationErrors) {
        setValidationErrors(err.data.validationErrors);
        console.warn('[usePromptsConfig] Validation errors:', err.data.validationErrors);
        return false;
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to update prompts config';
      setError(errorMessage);
      console.error('[usePromptsConfig] Update error:', err);
      return false;
    }
  }, []);

  // Сбросить конфигурацию к дефолтным значениям
  const resetConfig = useCallback(async (comment?: string): Promise<boolean> => {
    try {
      setError(null);
      
      const response = await apiClient.resetPromptsConfig(comment);
      
      if (response.success) {
        setConfig(response.config);
        console.log('[usePromptsConfig] Config reset to defaults. Version:', response.historyEntry.version);
        return true;
      } else {
        setError('Failed to reset prompts configuration');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset prompts config';
      setError(errorMessage);
      console.error('[usePromptsConfig] Reset error:', err);
      return false;
    }
  }, []);

  // Загрузить при монтировании
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return {
    config,
    loading,
    error,
    validationErrors,
    updateConfig,
    resetConfig,
    refresh: loadConfig
  };
}
