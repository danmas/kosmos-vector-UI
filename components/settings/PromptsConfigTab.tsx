import React, { useState, useEffect } from 'react';
import { PromptsConfig } from '../../types';

interface PromptsConfigTabProps {
  config: PromptsConfig | null;
  loading: boolean;
  error: string | null;
  validationErrors: string[];
  onSave: (updates: Partial<PromptsConfig>, comment?: string) => Promise<boolean>;
  onReset: (comment?: string) => Promise<boolean>;
}

export const PromptsConfigTab: React.FC<PromptsConfigTabProps> = ({
  config,
  loading,
  error,
  validationErrors,
  onSave,
  onReset
}) => {
  const [formData, setFormData] = useState<Partial<PromptsConfig>>({});
  const [comment, setComment] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData(config);
      setHasChanges(false);
    }
  }, [config]);

  const handleInputChange = (section: keyof PromptsConfig, field: string, value: string) => {
    setFormData({
      ...formData,
      [section]: {
        ...(formData[section] || {}),
        [field]: value
      }
    });
    setHasChanges(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      alert('Please enter a comment describing your changes');
      return;
    }
    setSaving(true);
    const success = await onSave(formData, comment);
    setSaving(false);
    if (success) {
      setHasChanges(false);
      setComment('');
    }
  };

  const handleReset = async () => {
    if (!window.confirm('⚠️ Reset prompts to default values?')) {
      return;
    }
    const resetComment = prompt('Enter comment for reset:');
    if (resetComment === null) return;
    
    setSaving(true);
    const success = await onReset(resetComment || 'Reset to defaults');
    setSaving(false);
    if (success) {
      setHasChanges(false);
      setComment('');
    }
  };

  // Debug: Log state
  console.log('[PromptsConfigTab] State:', { loading, error, hasConfig: !!config, config });

  if (loading) {
    return <div className="flex items-center justify-center py-8"><div className="text-slate-400 text-sm">Loading prompts...</div></div>;
  }

  if (error) {
    return <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 mb-3"><h3 className="text-red-400 font-medium text-sm mb-1">Error Loading Prompts</h3><p className="text-red-300 text-xs">{error}</p></div>;
  }

  if (!config) {
    return (
      <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
        <h3 className="text-yellow-400 font-medium text-sm mb-1">⚠️ No Configuration Loaded</h3>
        <p className="text-yellow-300 text-xs">The prompts configuration could not be loaded from the server.</p>
        <p className="text-yellow-300 text-xs mt-2">Please check that the backend server (port 3200) is running.</p>
      </div>
    );
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
        <h3 className="text-white font-medium text-sm border-b border-slate-700 pb-1.5">🤖 RAG Prompts</h3>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">System Prompt</label>
          <textarea
            value={(formData.rag as any)?.systemPrompt || ''}
            onChange={(e) => handleInputChange('rag', 'systemPrompt', e.target.value)}
            rows={6}
            className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            placeholder="Enter system prompt for RAG..."
          />
          <p className="text-[10px] text-slate-500 mt-0.5">Main system instruction for RAG queries</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">User Prompt Template</label>
          <textarea
            value={(formData.rag as any)?.userPromptTemplate || ''}
            onChange={(e) => handleInputChange('rag', 'userPromptTemplate', e.target.value)}
            rows={4}
            className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            placeholder="Enter user prompt template..."
          />
          <p className="text-[10px] text-slate-500 mt-0.5">Template with placeholders: {'{context}'}, {'{question}'}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        <h3 className="text-white font-medium text-sm border-b border-slate-700 pb-1.5">🔍 Natural Query Prompts</h3>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Script Generation Prompt</label>
          <textarea
            value={(formData.naturalQuery as any)?.scriptGeneration || ''}
            onChange={(e) => handleInputChange('naturalQuery', 'scriptGeneration', e.target.value)}
            rows={6}
            className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            placeholder="Enter script generation prompt..."
          />
          <p className="text-[10px] text-slate-500 mt-0.5">Prompt for generating SQL scripts from natural language</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Humanize Prompt</label>
          <textarea
            value={(formData.naturalQuery as any)?.humanize || ''}
            onChange={(e) => handleInputChange('naturalQuery', 'humanize', e.target.value)}
            rows={3}
            className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            placeholder="Enter humanize prompt..."
          />
          <p className="text-[10px] text-slate-500 mt-0.5">Prompt for converting results to human-readable format</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-300">💬 Comment (required)</label>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Describe your changes..."
          className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex justify-between pt-2">
        <button type="button" onClick={handleReset} disabled={saving || loading} className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">Reset to Defaults</button>
        <button type="submit" disabled={saving || loading || !hasChanges || !comment.trim()} className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving...' : 'Save Prompts'}</button>
      </div>
    </form>
  );
};
