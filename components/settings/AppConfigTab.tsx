import React, { useState, useEffect } from 'react';
import { AppConfig } from '../../types';
import { apiClient } from '../../services/apiClient';

interface AppConfigTabProps {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  validationErrors: string[];
  onSave: (updates: Partial<AppConfig>) => Promise<boolean>;
  onReset: () => Promise<boolean>;
}

export const AppConfigTab: React.FC<AppConfigTabProps> = ({
  config,
  loading,
  error,
  validationErrors,
  onSave,
  onReset
}) => {
  const [formData, setFormData] = useState<Partial<AppConfig>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Model test state
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; response: string } | null>(null);

  useEffect(() => {
    if (config) {
      setFormData(config);
      setHasChanges(false);
    }
  }, [config]);

  const handleInputChange = (field: keyof AppConfig, value: any) => {
    setFormData({ ...formData, [field]: value });
    setHasChanges(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const success = await onSave(formData);
    setSaving(false);
    if (success) {
      setHasChanges(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('⚠️ Are you sure?\n\nAll settings will be reset to default values.')) {
      return;
    }
    setSaving(true);
    const success = await onReset();
    setSaving(false);
    if (success) {
      setHasChanges(false);
    }
  };

  // Test model connection
  const handleTestModel = async (modelType: 'default' | 'logic') => {
    const model = modelType === 'default' 
      ? (formData.KOSMOS_MODEL || config?.KOSMOS_MODEL)
      : (formData.KOSMOS_LOGIC_ARHITECT_MODEL || config?.KOSMOS_LOGIC_ARHITECT_MODEL);
    
    if (!model) {
      setTestResult({ success: false, response: 'Model not specified' });
      return;
    }

    setTestingModel(true);
    setTestResult(null);
    
    try {
      const response = await apiClient.ask({
        message: 'Привет! Это тестовое сообщение для проверки подключения. Ответь кратко.',
        model: model
      });
      
      setTestResult({ 
        success: true, 
        response: response.response 
      });
    } catch (error: any) {
      setTestResult({ 
        success: false, 
        response: error.message || 'Failed to connect to model' 
      });
    } finally {
      setTestingModel(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><div className="text-slate-400 text-sm">Loading settings...</div></div>;
  }

  if (error) {
    return <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 mb-3"><h3 className="text-red-400 font-medium text-sm mb-1">Error Loading Settings</h3><p className="text-red-300 text-xs">{error}</p></div>;
  }

  if (!config) {
    return <div className="text-slate-400 text-sm">No configuration loaded</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {validationErrors.length > 0 && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
          <h3 className="text-red-400 font-medium text-xs mb-1.5">Validation Errors:</h3>
          <ul className="list-disc list-inside space-y-0.5">
            {validationErrors.map((err, i) => <li key={i} className="text-red-300 text-xs">{err}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-2.5">
        <h3 className="text-white font-medium text-sm border-b border-slate-700 pb-1.5">🔧 LLM Server Configuration</h3>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Base URL <span className="text-red-400">*</span></label>
          <input type="url" value={formData.KOSMOS_BASE_URL || ''} onChange={(e) => handleInputChange('KOSMOS_BASE_URL', e.target.value)} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="http://localhost:3002/v1" required />
          <p className="text-[10px] text-slate-500 mt-0.5">URL of the external LLM server</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Default Model <span className="text-red-400">*</span></label>
            <div className="flex gap-2">
              <input type="text" value={formData.KOSMOS_MODEL || ''} onChange={(e) => handleInputChange('KOSMOS_MODEL', e.target.value)} className="flex-1 bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="FAST" required />
              <button
                type="button"
                onClick={() => handleTestModel('default')}
                disabled={testingModel || loading}
                className="px-2 py-1 text-xs font-medium rounded transition-colors bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title="Test model connection"
              >
                {testingModel ? '...' : '🧪'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Logic Architect Model</label>
            <div className="flex gap-2">
              <input type="text" value={formData.KOSMOS_LOGIC_ARHITECT_MODEL || ''} onChange={(e) => handleInputChange('KOSMOS_LOGIC_ARHITECT_MODEL', e.target.value || null)} className="flex-1 bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="INSTRUCT" />
              <button
                type="button"
                onClick={() => handleTestModel('logic')}
                disabled={testingModel || loading}
                className="px-2 py-1 text-xs font-medium rounded transition-colors bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title="Test model connection"
              >
                {testingModel ? '...' : '🧪'}
              </button>
            </div>
          </div>
        </div>
        
        {/* Test Result */}
        {testResult && (
          <div className={`mt-2 p-2 rounded text-xs ${
            testResult.success 
              ? 'bg-emerald-900/20 border border-emerald-700/30 text-emerald-300'
              : 'bg-red-900/20 border border-red-700/30 text-red-300'
          }`}>
            <div className="font-medium mb-1">
              {testResult.success ? '✅ Model Response:' : '❌ Error:'}
            </div>
            <div className="whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
              {testResult.response}
            </div>
            <button 
              onClick={() => setTestResult(null)}
              className="mt-1 text-slate-400 hover:text-white"
            >
              ✕ Close
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        <h3 className="text-white font-medium text-sm border-b border-slate-700 pb-1.5">📊 System Settings</h3>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Log Level <span className="text-red-400">*</span></label>
          <select value={formData.LOG_LEVEL || 'info'} onChange={(e) => handleInputChange('LOG_LEVEL', e.target.value as 'debug' | 'info' | 'warn' | 'error')} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      <div className="space-y-2.5">
        <h3 className="text-white font-medium text-sm border-b border-slate-700 pb-1.5">🔍 Natural Query Settings</h3>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Suggest Limit (1-100) <span className="text-red-400">*</span></label>
          <input type="number" min="1" max="100" value={formData.NATURAL_QUERY_SUGGEST_LIMIT || 5} onChange={(e) => handleInputChange('NATURAL_QUERY_SUGGEST_LIMIT', parseInt(e.target.value))} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Similarity Threshold (0-1) <span className="text-red-400">*</span></label>
            <input type="number" min="0" max="1" step="0.01" value={formData.NATURAL_QUERY_SIMILARITY_THRESHOLD || 0.8} onChange={(e) => handleInputChange('NATURAL_QUERY_SIMILARITY_THRESHOLD', parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Auto Use Threshold (0-1) <span className="text-red-400">*</span></label>
            <input type="number" min="0" max="1" step="0.01" value={formData.NATURAL_QUERY_AUTO_USE_THRESHOLD || 0.95} onChange={(e) => handleInputChange('NATURAL_QUERY_AUTO_USE_THRESHOLD', parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" required />
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button type="button" onClick={handleReset} disabled={saving || loading} className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">Reset to Defaults</button>
        <button type="submit" disabled={saving || loading || !hasChanges} className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>
    </form>
  );
};
