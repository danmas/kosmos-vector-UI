import React, { useState, useEffect } from 'react';
import { useAppConfig } from '../lib/hooks/useAppConfig';
import { AppConfig } from '../types';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const { config, loading, error, validationErrors, updateConfig, resetConfig } = useAppConfig();
  const [formData, setFormData] = useState<Partial<AppConfig>>({});
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Инициализация формы при загрузке конфигурации
  useEffect(() => {
    if (config) {
      setFormData(config);
      setHasChanges(false);
    }
  }, [config]);

  // Скрыть успешное сообщение через 3 секунды
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  if (!isOpen) return null;

  const handleInputChange = (field: keyof AppConfig, value: any) => {
    setFormData({ ...formData, [field]: value });
    setHasChanges(true);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);

    const success = await updateConfig(formData);
    setSaving(false);

    if (success) {
      setHasChanges(false);
      setSuccessMessage('✅ Settings saved successfully!');
    }
  };

  const handleReset = async () => {
    if (!window.confirm('⚠️ Are you sure?\n\nAll settings will be reset to default values.\nThis action cannot be undone.')) {
      return;
    }

    setSaving(true);
    setSuccessMessage(null);

    const success = await resetConfig();
    setSaving(false);

    if (success) {
      setHasChanges(false);
      setSuccessMessage('✅ Settings reset to defaults!');
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div 
        className="bg-slate-800 rounded-lg shadow-2xl border border-slate-700 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">System Settings</h2>
            <p className="text-xs text-slate-400 mt-0.5">Configure global application settings (port 3200)</p>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-slate-400 text-sm">Loading settings...</div>
            </div>
          ) : error ? (
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 mb-3">
              <h3 className="text-red-400 font-medium text-sm mb-1">Error Loading Settings</h3>
              <p className="text-red-300 text-xs">{error}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Success Message */}
              {successMessage && (
                <div className="bg-green-900/20 border border-green-700/30 text-green-400 text-xs px-3 py-2 rounded-lg">
                  {successMessage}
                </div>
              )}

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                  <h3 className="text-red-400 font-medium text-xs mb-1.5">Validation Errors:</h3>
                  <ul className="list-disc list-inside space-y-0.5">
                    {validationErrors.map((err, i) => (
                      <li key={i} className="text-red-300 text-xs">{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* LLM Server Settings */}
              <div className="space-y-2.5">
                <h3 className="text-white font-medium text-sm border-b border-slate-700 pb-1.5">
                  🔧 LLM Server Configuration
                </h3>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Base URL <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="url"
                    value={formData.KOSMOS_BASE_URL || ''}
                    onChange={(e) => handleInputChange('KOSMOS_BASE_URL', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="http://localhost:3002/v1"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">URL of the external LLM server (kosmos-model)</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Default Model <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.KOSMOS_MODEL || ''}
                      onChange={(e) => handleInputChange('KOSMOS_MODEL', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="FAST"
                      required
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Model for LLM requests</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Logic Architect Model
                    </label>
                    <input
                      type="text"
                      value={formData.KOSMOS_LOGIC_ARHITECT_MODEL || ''}
                      onChange={(e) => handleInputChange('KOSMOS_LOGIC_ARHITECT_MODEL', e.target.value || null)}
                      className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="INSTRUCT"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Model for logic analysis</p>
                  </div>
                </div>
              </div>

              {/* System Settings */}
              <div className="space-y-2.5">
                <h3 className="text-white font-medium text-sm border-b border-slate-700 pb-1.5">
                  📊 System Settings
                </h3>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Log Level <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formData.LOG_LEVEL || 'info'}
                    onChange={(e) => handleInputChange('LOG_LEVEL', e.target.value as 'debug' | 'info' | 'warn' | 'error')}
                    className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="debug">Debug</option>
                    <option value="info">Info</option>
                    <option value="warn">Warning</option>
                    <option value="error">Error</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-0.5">Logging verbosity level</p>
                </div>
              </div>

              {/* Natural Query Settings */}
              <div className="space-y-2.5">
                <h3 className="text-white font-medium text-sm border-b border-slate-700 pb-1.5">
                  🔍 Natural Query Settings
                </h3>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Suggest Limit (1-100) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.NATURAL_QUERY_SUGGEST_LIMIT || 5}
                    onChange={(e) => handleInputChange('NATURAL_QUERY_SUGGEST_LIMIT', parseInt(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Number of suggestions for natural query</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Similarity Threshold (0-1) <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={formData.NATURAL_QUERY_SIMILARITY_THRESHOLD || 0.8}
                      onChange={(e) => handleInputChange('NATURAL_QUERY_SIMILARITY_THRESHOLD', parseFloat(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Similarity threshold for search</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Auto Use Threshold (0-1) <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={formData.NATURAL_QUERY_AUTO_USE_THRESHOLD || 0.95}
                      onChange={(e) => handleInputChange('NATURAL_QUERY_AUTO_USE_THRESHOLD', parseFloat(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-sm px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      required
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Threshold for auto-using cached scripts</p>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-700 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || loading}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset to Defaults
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={saving || loading || !hasChanges}
              className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
