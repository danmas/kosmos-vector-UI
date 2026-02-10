import { useState, useEffect, useCallback } from 'react';
import { AppConfig, AppConfigUpdateRequest } from '../../types';
import { apiClient } from '../../services/apiClient';

interface UseAppConfigReturn {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  validationErrors: string[];
  updateConfig: (updates: AppConfigUpdateRequest) => Promise<boolean>;
  resetConfig: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Хук для работы с App Config API (v2.8.0)
 * Управление глобальными настройками приложения
 */
export function useAppConfig(): UseAppConfigReturn {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Загрузить конфигурацию
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.getAppConfig();
      
      if (response.success) {
        setConfig(response.config);
      } else {
        setError('Failed to load configuration');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load config';
      setError(errorMessage);
      console.error('[useAppConfig] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Обновить конфигурацию
  const updateConfig = useCallback(async (updates: AppConfigUpdateRequest): Promise<boolean> => {
    try {
      setError(null);
      setValidationErrors([]);
      
      const response = await apiClient.updateAppConfig(updates);
      
      if (response.success) {
        setConfig(response.config);
        console.log('[useAppConfig] Config updated successfully:', response.message);
        return true;
      } else {
        setError('Failed to update configuration');
        return false;
      }
    } catch (err: any) {
      // Обработка ошибок валидации
      if (err.status === 400 && err.data?.validationErrors) {
        setValidationErrors(err.data.validationErrors);
        console.warn('[useAppConfig] Validation errors:', err.data.validationErrors);
        return false;
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to update config';
      setError(errorMessage);
      console.error('[useAppConfig] Update error:', err);
      return false;
    }
  }, []);

  // Сбросить конфигурацию к значениям по умолчанию
  const resetConfig = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      
      const response = await apiClient.resetAppConfig();
      
      if (response.success) {
        setConfig(response.config);
        console.log('[useAppConfig] Config reset to defaults:', response.message);
        return true;
      } else {
        setError('Failed to reset configuration');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset config';
      setError(errorMessage);
      console.error('[useAppConfig] Reset error:', err);
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
