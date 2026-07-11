import React, { useState } from 'react';
import { useAppConfig } from '../lib/hooks/useAppConfig';
import { usePromptsConfig } from '../lib/hooks/usePromptsConfig';
import { AppConfigTab } from './settings/AppConfigTab';
import { PromptsConfigTab } from './settings/PromptsConfigTab';
import TypesConfigTab from './settings/TypesConfigTab';
import { OntologyBuilderConfigTab } from './settings/OntologyBuilderConfigTab';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabId = 'app' | 'prompts' | 'types' | 'ontology';

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('app');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // App Config hook
  const appConfig = useAppConfig();
  
  // Prompts Config hook
  const promptsConfig = usePromptsConfig();

  if (!isOpen) return null;

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const tabs = [
    { id: 'app' as TabId, label: 'App Config', icon: '⚙️' },
    { id: 'prompts' as TabId, label: 'Prompts Config', icon: '🤖' },
    { id: 'ontology' as TabId, label: 'Ontology Builder', icon: '🕸' },
    { id: 'types' as TabId, label: 'Item Types', icon: '📦' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div 
        className="bg-slate-800 rounded-lg shadow-2xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">System Settings</h2>
            <p className="text-xs text-slate-400 mt-0.5">Configure application and prompts (port 3200)</p>
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

        {/* Tabs */}
        <div className="flex border-b border-slate-700 bg-slate-900/50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {activeTab === 'app' && (
            <AppConfigTab
              config={appConfig.config}
              loading={appConfig.loading}
              error={appConfig.error}
              validationErrors={appConfig.validationErrors}
              onSave={appConfig.updateConfig}
              onReset={appConfig.resetConfig}
            />
          )}
          
          {activeTab === 'prompts' && (
            <PromptsConfigTab
              config={promptsConfig.config}
              loading={promptsConfig.loading}
              error={promptsConfig.error}
              validationErrors={promptsConfig.validationErrors}
              onSave={promptsConfig.updateConfig}
              onReset={promptsConfig.resetConfig}
            />
          )}

          {activeTab === 'ontology' && (
            <OntologyBuilderConfigTab
              config={appConfig.config}
              factoryOntologyBuilder={appConfig.factoryOntologyBuilder}
              loading={appConfig.loading}
              error={appConfig.error}
              validationErrors={appConfig.validationErrors}
              onSave={appConfig.updateConfig}
            />
          )}
          
          {activeTab === 'types' && (
            <TypesConfigTab />
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
