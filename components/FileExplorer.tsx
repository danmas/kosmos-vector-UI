import React, { useState, useEffect } from 'react';
import { FileNode, ProjectFile, KnowledgeBaseConfig } from '../types';
import { getProjectTreeWithFallback, getKbConfigWithFallback, apiClient } from '../services/apiClient';

interface FileExplorerProps {
  // Обратная совместимость
  files?: FileNode[];
  onScan?: (path: string, includePatterns?: string, ignorePatterns?: string) => void;
  currentPath?: string;
  isLoading?: boolean;
  error?: string | null;
  onSelectionChange?: (selectedFiles: string[], excludedFiles: string[]) => void;
  onStartProcessing?: (config: {
    projectPath: string;
    filePatterns: string[];
    selectedFiles: string[];
    excludedFiles: string[];
  }) => void;
  
  // v2.1.1: Новый режим с самоуправлением
  standalone?: boolean; // Если true, компонент управляет собственным состоянием через новые API
}

// Universal node type for both FileNode and ProjectFile
type TreeNode = FileNode | ProjectFile;

// Helper functions to work with universal node type
const getNodeId = (node: TreeNode): string => {
  return 'id' in node ? node.id : node.path;
};

const getNodeType = (node: TreeNode): 'file' | 'folder' | 'directory' => {
  return node.type;
};

const isDirectory = (node: TreeNode): boolean => {
  return node.type === 'folder' || node.type === 'directory';
};

const getNodeSize = (node: TreeNode): number => {
  return 'size' in node ? node.size : 0;
};

// Recursive component for the tree (universal for FileNode and ProjectFile)
const FileTreeNode: React.FC<{ 
  node: TreeNode; 
  depth: number; 
  checkedFiles: Set<string>;
  onToggleCheck: (filePath: string, checked: boolean, isDirectory: boolean) => void;
}> = ({ node, depth, checkedFiles, onToggleCheck }) => {
  const [expanded, setExpanded] = useState(true);
  const nodeId = getNodeId(node);
  const isChecked = checkedFiles.has(nodeId);

  const toggleExpand = () => setExpanded(!expanded);
  const toggleCheck = () => {
    onToggleCheck(nodeId, !isChecked, isDirectory(node));
  };

  const nodeSize = getNodeSize(node);
  const sizeText = nodeSize > 0 ? ` (${(nodeSize / 1024).toFixed(1)}KB)` : '';

  return (
    <div className="select-none">
      <div 
        className={`flex items-center py-0.5 hover:bg-slate-800 cursor-pointer`}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <button onClick={toggleExpand} className="mr-1.5 w-3 text-slate-400 flex justify-center text-xs">
          {isDirectory(node) ? (expanded ? '▼' : '▶') : '•'}
        </button>
        
        <input 
          type="checkbox" 
          checked={isChecked} 
          onChange={toggleCheck}
          className="mr-1.5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-offset-0 focus:ring-0 w-3.5 h-3.5"
        />
        
        <span className={`text-sm ${isDirectory(node) ? 'font-bold text-slate-300' : 'text-slate-400'} ${node.error ? 'text-red-400 line-through' : ''}`}>
          {node.name}{sizeText} {node.error && `(${node.errorMessage || 'Access Denied'})`}
          {'language' in node && node.language && (
            <span className="ml-1 text-xs text-blue-400">[{node.language}]</span>
          )}
        </span>
      </div>
      
      {expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode 
              key={getNodeId(child)} 
              node={child} 
              depth={depth + 1} 
              checkedFiles={checkedFiles}
              onToggleCheck={onToggleCheck}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const FileExplorer: React.FC<FileExplorerProps> = ({ 
  files: propsFiles, 
  onScan, 
  currentPath, 
  isLoading: propsIsLoading, 
  error: propsError, 
  onSelectionChange,
  onStartProcessing,
  standalone = false
}) => {
  // Состояние для обратной совместимости (legacy mode)
  const [mask, setMask] = useState('**/*.{py,js,ts,tsx,go,java}');
  const [ignore, setIgnore] = useState('**/tests/*, **/venv/*, **/node_modules/*');
  const [pathInput, setPathInput] = useState('./');
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  // Новое состояние для standalone режима (v2.1.1)
  const [kbConfig, setKbConfig] = useState<KnowledgeBaseConfig | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [customSettings, setCustomSettings] = useState('');
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [settingsDialogValue, setSettingsDialogValue] = useState('');

  // Определяем, какие данные использовать в зависимости от режима
  const files = standalone ? projectFiles : (propsFiles || []);
  const isLoading = standalone ? isLoadingFiles : (propsIsLoading || false);
  const error = standalone ? filesError : propsError;

  // v2.1.1: Загрузка KB конфигурации через новый API
  const loadKbConfigV2 = async () => {
    try {
      console.log('[KB Config v2.1.1] Loading configuration...');
      const result = await getKbConfigWithFallback();
      setKbConfig(result.data);
      setIsDemoMode(result.isDemo);
      
      // Обновляем поля интерфейса
      if (result.data.rootPath) {
        setPathInput(result.data.rootPath);
      } else {
        setPathInput(result.data.targetPath || './');
      }
      setMask(result.data.includeMask || '**/*.{py,js,ts,tsx,go,java}');
      setIgnore(result.data.ignorePatterns || '**/tests/*, **/venv/*, **/node_modules/*');
      setCustomSettings(result.data.metadata?.custom_settings || '');
      
      console.log('[KB Config v2.1.1] Configuration loaded successfully');
    } catch (error) {
      console.error('[KB Config v2.1.1] Error loading configuration:', error);
      setFilesError('Failed to load configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsConfigLoaded(true);
    }
  };

  // Legacy: Загрузка конфигурации KB с сервера (обратная совместимость)
  const loadKbConfig = async () => {
    try {
      const response = await fetch('/api/kb-config');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.config) {
          setPathInput(data.config.rootPath || data.config.targetPath || './');
          setMask(data.config.includeMask || '**/*.{py,js,ts,tsx,go,java}');
          setIgnore(data.config.ignorePatterns || '**/tests/*, **/venv/*, **/node_modules/*');
          setCustomSettings(data.config.metadata?.custom_settings || '');
          console.log('[KB Config] Loaded configuration from server');
        }
      } else {
        console.warn('[KB Config] Failed to load configuration, using defaults');
      }
    } catch (error) {
      console.error('[KB Config] Error loading configuration:', error);
    } finally {
      setIsConfigLoaded(true);
    }
  };

  // v2.1.1: Загрузка дерева проекта через новый API
  const loadProjectTree = async (rootPath: string) => {
    try {
      setIsLoadingFiles(true);
      setFilesError(null);
      console.log('[Project Tree v2.1.1] Loading tree for:', rootPath);
      
      const result = await getProjectTreeWithFallback(rootPath, 12);
      setProjectFiles(result.data);
      setIsDemoMode(result.isDemo);
      
      console.log('[Project Tree v2.1.1] Tree loaded successfully:', result.data.length, 'items');
    } catch (error) {
      console.error('[Project Tree v2.1.1] Error loading project tree:', error);
      setFilesError('Failed to load project tree: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setProjectFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // v2.1.1: Сохранение выборки файлов через новый API
  const saveFileSelection = async (selectedFiles: string[]) => {
    if (!kbConfig) return;
    
    try {
      setSaveStatus('saving');
      console.log('[File Selection v2.1.1] Saving selection:', selectedFiles.length, 'files');
      
      const result = await apiClient.saveFileSelection({
        rootPath: pathInput,
        files: selectedFiles
      });
      
      setKbConfig(result.config);
      setSaveStatus('saved');
      console.log('[File Selection v2.1.1] Selection saved successfully');
      
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[File Selection v2.1.1] Error saving selection:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // Legacy: Сохранение конфигурации KB на сервер (обратная совместимость)
  const saveKbConfig = async (targetPath: string, includeMask: string, ignorePatterns: string, customSettingsValue?: string) => {
    try {
      setSaveStatus('saving');
      
      const settingsToSave = customSettingsValue !== undefined ? customSettingsValue : customSettings;
      
      if (standalone && kbConfig) {
        // v2.1.1: Используем новый API для обновления конфигурации
        const result = await apiClient.updateKbConfig({
          rootPath: targetPath,
          includeMask,
          ignorePatterns,
          metadata: {
            ...kbConfig.metadata,
            custom_settings: settingsToSave
          }
        });
        // Обновляем только metadata, чтобы не вызывать перерисовку списка файлов
        setKbConfig(prev => prev ? { ...prev, metadata: result.config.metadata } : result.config);
      } else {
        // Legacy: Используем старый API
        const response = await fetch('/api/kb-config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            targetPath,
            includeMask,
            ignorePatterns,
            metadata: {
              custom_settings: settingsToSave
            }
          })
        });

        if (!response.ok) {
          throw new Error('Failed to save configuration');
        }
      }

      setSaveStatus('saved');
      console.log('[KB Config] Configuration saved successfully');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
      console.error('[KB Config] Error saving configuration:', error);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // Загружаем конфигурацию при инициализации компонента
  useEffect(() => {
    if (standalone) {
      loadKbConfigV2();
    } else {
      loadKbConfig();
    }
  }, [standalone]);

  // Автоматическая загрузка дерева проекта в standalone режиме
  useEffect(() => {
    if (standalone && kbConfig && isConfigLoaded && pathInput) {
      // Загружаем дерево только если изменился rootPath, а не metadata
      loadProjectTree(pathInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standalone, kbConfig?.rootPath, pathInput, isConfigLoaded]);

  useEffect(() => {
    if (!standalone) {
      if (currentPath) {
          setPathInput(currentPath);
      } else {
          // Default to current directory if nothing selected
          setPathInput('./');
      }
    }
  }, [currentPath, standalone]);

  // Инициализируем выбранные файлы при загрузке нового дерева (универсальный для FileNode и ProjectFile)
  useEffect(() => {
    if (files.length > 0) {
      const initialChecked = new Set<string>();
      const collectInitialChecked = (nodes: TreeNode[]) => {
        nodes.forEach(node => {
          const nodeId = getNodeId(node);
          const isSelected = 'checked' in node ? node.checked : ('selected' in node ? node.selected : false);
          
          if (isSelected && !isDirectory(node)) {
            initialChecked.add(nodeId);
          }
          if (node.children) {
            collectInitialChecked(node.children);
          }
        });
      };
      collectInitialChecked(files);
      setCheckedFiles(initialChecked);
      
      // v2.1.1: При загрузке файлов в standalone режиме, синхронизируем с fileSelection из конфигурации
      if (standalone && kbConfig?.fileSelection && kbConfig.fileSelection.length > 0) {
        const kbSelection = new Set(kbConfig.fileSelection);
        setCheckedFiles(kbSelection);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, standalone, kbConfig?.fileSelection]);

  const handleScanClick = () => {
    if (standalone) {
      // v2.1.1: Загружаем дерево проекта напрямую
      loadProjectTree(pathInput);
    } else {
      // Legacy: Используем callback
      if (onScan && pathInput) {
        onScan(pathInput, mask, ignore);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        handleScanClick();
    }
  };

  // Автосохранение конфигурации при изменении настроек (debounce 1 секунда)
  useEffect(() => {
    if (!isConfigLoaded) {
      return; // Не сохраняем до загрузки конфигурации
    }

    const timeoutId = setTimeout(() => {
      saveKbConfig(pathInput, mask, ignore, customSettings);
    }, 1000); // 1 секунда debounce для сохранения

    return () => clearTimeout(timeoutId);
  }, [pathInput, mask, ignore, customSettings, isConfigLoaded]);

  // Автоматическое обновление при изменении паттернов (debounce 500ms)
  useEffect(() => {
    // Не обновляем автоматически при первой загрузке или до загрузки конфигурации
    if (files.length === 0 || !pathInput || isLoading || !isConfigLoaded) {
      return;
    }

    const timeoutId = setTimeout(() => {
      if (pathInput && !isLoading) {
        onScan(pathInput, mask, ignore);
      }
    }, 500); // 500ms debounce для обновления

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mask, ignore, pathInput, isConfigLoaded]); // Добавляем isConfigLoaded в зависимости

  // Обработка Escape для закрытия диалога
  useEffect(() => {
    if (!isSettingsDialogOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSettingsDialogOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isSettingsDialogOpen]);

  const handleToggleCheck = (filePath: string, checked: boolean, isDirectory: boolean) => {
    const newCheckedFiles = new Set(checkedFiles);
    
    if (isDirectory) {
      // Если это папка, рекурсивно отмечаем/снимаем все файлы внутри
      const toggleDirectoryFiles = (nodes: FileNode[], check: boolean) => {
        nodes.forEach(node => {
          if (node.type === 'file') {
            if (check) {
              newCheckedFiles.add(node.id);
            } else {
              newCheckedFiles.delete(node.id);
            }
          } else if (node.children) {
            toggleDirectoryFiles(node.children, check);
          }
        });
      };
      
      // Найдем папку и обработаем её содержимое
      const findAndToggleDirectory = (nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.id === filePath && node.children) {
            toggleDirectoryFiles(node.children, checked);
            return true;
          } else if (node.children && findAndToggleDirectory(node.children)) {
            return true;
          }
        }
        return false;
      };
      
      findAndToggleDirectory(files);
    } else {
      // Если это файл
      if (checked) {
        newCheckedFiles.add(filePath);
      } else {
        newCheckedFiles.delete(filePath);
      }
    }
    
    setCheckedFiles(newCheckedFiles);
    
    // Уведомляем об изменениях
    const selectedFiles: string[] = Array.from(newCheckedFiles) as string[];
    const excludedFiles: string[] = []; // Пока исключения не реализованы
    
    if (standalone) {
      // v2.1.1: Автоматически сохраняем выборку через новый API
      saveFileSelection(selectedFiles);
    }
    
    // Legacy: Уведомляем родительский компонент об изменениях
    if (onSelectionChange) {
      onSelectionChange(selectedFiles, excludedFiles);
    }
  };

  const handleStartProcessing = () => {
    if (onStartProcessing) {
      const selectedFiles = Array.from(checkedFiles);
      const filePatterns = mask.split(',').map(p => p.trim()).filter(p => p);
      
      onStartProcessing({
        projectPath: pathInput,
        filePatterns,
        selectedFiles,
        excludedFiles: []
      });
    }
  };

  // Подсчет общего количества файлов (универсальный для FileNode и ProjectFile)
  function countFiles(nodes: TreeNode[]): number {
    return nodes.reduce((count, node) => {
      if (!isDirectory(node)) {
        return count + 1;
      } else if (node.children) {
        return count + countFiles(node.children);
      }
      return count;
    }, 0);
  }

  // Подсчет общего размера выбранных файлов (только для ProjectFile)
  function calculateSelectedSize(nodes: TreeNode[], selectedFiles: Set<string>): number {
    return nodes.reduce((size, node) => {
      const nodeId = getNodeId(node);
      
      if (!isDirectory(node) && selectedFiles.has(nodeId)) {
        return size + getNodeSize(node);
      } else if (node.children) {
        return size + calculateSelectedSize(node.children, selectedFiles);
      }
      return size;
    }, 0);
  }

  const selectedCount = checkedFiles.size;
  const totalFiles = countFiles(files);
  const selectedSize = calculateSelectedSize(files, checkedFiles);
  const totalSizeText = selectedSize > 0 ? ` (${(selectedSize / 1024).toFixed(1)}KB)` : '';

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-slate-700">
        <div className="flex justify-between items-center mb-1.5">
          <h2 className="text-lg font-semibold text-white">
            Knowledge Base Configuration
            {standalone && (
              <span className="ml-1.5 text-xs text-blue-400 font-normal">v2.1.1</span>
            )}
          </h2>
          {isDemoMode && (
            <div className="text-amber-400 text-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Demo Mode
            </div>
          )}
        </div>
        
        {/* Folder Selection */}
        <div className="mb-2">
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-0.5">Target Project Folder</label>
            <div className="flex gap-1.5">
                <div className="flex-1 relative">
                    <input 
                        type="text" 
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="./"
                        disabled={isLoading}
                        className={`w-full bg-slate-800 border rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none font-mono h-8 ${error ? 'border-red-500' : 'border-slate-600'}`}
                    />
                </div>
                <button 
                    onClick={handleScanClick}
                    disabled={isLoading}
                    className={`px-2.5 py-1 rounded font-medium transition-colors text-xs flex items-center gap-1 min-w-[90px] justify-center h-8 ${
                        isLoading ? 'bg-slate-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                >
                    {isLoading ? (
                        <>
                         <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                         Scanning
                        </>
                    ) : 'Scan Folder'}
                </button>
            </div>
            {error && (
                <p className="text-red-400 text-xs mt-0.5 flex items-center gap-1 font-mono bg-red-900/20 px-1.5 py-0.5 rounded">
                    ⚠️ {error}
                </p>
            )}
            <p className="text-slate-500 text-xs mt-0.5 leading-tight">
                Tip: Use <code>./</code> to scan the current server directory. If running in the cloud, local paths (like <code>C:/</code>) are not accessible.
            </p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-1.5" style={{ gridTemplateRows: 'repeat(1, 1fr)' }}>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-0.5">Include Mask</label>
            <input 
              type="text" 
              value={mask}
              onChange={(e) => setMask(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none h-8"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-0.5">Ignore Patterns</label>
            <input 
              type="text" 
              value={ignore}
              onChange={(e) => setIgnore(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none h-8"
            />
          </div>
          <div className="mb-1.5">
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-0.5">Custom Settings</label>
            <div className="flex gap-1.5">
              <textarea 
                value={customSettings}
                onChange={(e) => setCustomSettings(e.target.value)}
                placeholder="Произвольные настройки (YAML)"
                rows={2}
                readOnly
                className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none resize-none cursor-pointer"
                onClick={() => {
                  setSettingsDialogValue(customSettings);
                  setIsSettingsDialogOpen(true);
                }}
              />
              <button
                onClick={() => {
                  setSettingsDialogValue(customSettings);
                  setIsSettingsDialogOpen(true);
                }}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-medium transition-colors h-8 flex items-center justify-center"
                title="Открыть редактор YAML"
              >
                ✏️
              </button>
            </div>
          </div>
        </div>

        {/* Индикатор статуса сохранения */}
        {saveStatus !== 'idle' && (
          <div className={`text-xs mb-1 flex items-center gap-1 px-1.5 py-0.5 rounded ${
            saveStatus === 'saving' ? 'bg-blue-900/20 text-blue-400' :
            saveStatus === 'saved' ? 'bg-green-900/20 text-green-400' :
            'bg-red-900/20 text-red-400'
          }`}>
            {saveStatus === 'saving' && (
              <>
                <div className="w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                Сохранение...
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <span>✓</span>
                Сохранено
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <span>⚠️</span>
                Ошибка
              </>
            )}
          </div>
         )}
       </div>

      {/* Диалог редактирования Custom Settings */}
      {isSettingsDialogOpen && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" 
          onClick={() => setIsSettingsDialogOpen(false)}
        >
          <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Редактирование Custom Settings (YAML)</h3>
              <p className="text-xs text-slate-400 mt-1">Редактируйте YAML конфигурацию. Нажмите "Сохранить" для применения изменений.</p>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <textarea
                value={settingsDialogValue}
                onChange={(e) => setSettingsDialogValue(e.target.value)}
                placeholder="# Пример YAML конфигурации&#10;key1: value1&#10;key2:&#10;  nested: value2&#10;list:&#10;  - item1&#10;  - item2&#10;&#10;# Настройки сохраняются автоматически при нажатии 'Сохранить'"
                className="w-full h-full min-h-[400px] bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 outline-none resize-none"
                style={{ fontFamily: 'monospace', lineHeight: '1.5' }}
                autoFocus
                spellCheck={false}
              />
            </div>
            <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
              <button
                onClick={() => setIsSettingsDialogOpen(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-medium transition-colors"
              >
                Отмена (Esc)
              </button>
              <button
                onClick={() => {
                  setCustomSettings(settingsDialogValue);
                  setIsSettingsDialogOpen(false);
                  // Сохраняем сразу при закрытии диалога
                  saveKbConfig(pathInput, mask, ignore, settingsDialogValue);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

       <div className="flex-1 overflow-y-auto p-2" style={{ minHeight: 0 }}>
        <div className={`bg-slate-900 border rounded-lg p-2 ${error ? 'border-red-900/50 bg-red-900/10' : 'border-slate-700'}`}>
          {isLoading ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] text-slate-500 gap-3">
                  <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                  <p>Analyzing directory structure...</p>
              </div>
          ) : files.length > 0 ? (
            files.map((node) => (
                <FileTreeNode 
                  key={getNodeId(node)} 
                  node={node} 
                  depth={1} 
                  checkedFiles={checkedFiles}
                  onToggleCheck={handleToggleCheck}
                />
            ))
          ) : (
            <div className="text-center text-slate-500 py-10 min-h-[200px] flex items-center justify-center">
                No files found. Check path and click "Scan Folder".
            </div>
          )}
        </div>
      </div>
      
      <div className="p-2 border-t border-slate-700 bg-slate-800/50">
        <div className="flex justify-between items-center">
            <div className="text-xs text-slate-400">
                {files.length > 0 ? (
                  <span>
                    Selected: <span className="font-bold text-blue-400">{selectedCount}</span> of {totalFiles} files
                    {totalSizeText && <span className="text-slate-500">{totalSizeText}</span>}
                  </span>
                ) : 'Waiting for valid source...'}
            </div>
            <div className="flex gap-1.5">
              <button 
                className="bg-gray-600 hover:bg-gray-500 text-white px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed h-7" 
                disabled={files.length === 0}
                onClick={() => {
                  // Отметить/снять все файлы (универсальный для FileNode и ProjectFile)
                  const allFiles = new Set<string>();
                  const collectAllFiles = (nodes: TreeNode[]) => {
                    nodes.forEach(node => {
                      const nodeId = getNodeId(node);
                      if (!isDirectory(node)) {
                        allFiles.add(nodeId);
                      } else if (node.children) {
                        collectAllFiles(node.children);
                      }
                    });
                  };
                  collectAllFiles(files);
                  
                  const isAllSelected = Array.from(allFiles).every(file => checkedFiles.has(file));
                  const newSelection = isAllSelected ? new Set<string>() : allFiles;
                  const selectedArray = Array.from(newSelection);
                  
                  setCheckedFiles(newSelection);
                  
                  if (standalone) {
                    // v2.1.1: Автоматически сохраняем выборку
                    saveFileSelection(selectedArray);
                  }
                  
                  // Legacy: Уведомляем родительский компонент
                  if (onSelectionChange) {
                    onSelectionChange(selectedArray, []);
                  }
                }}
              >
                {selectedCount === totalFiles ? 'Deselect All' : 'Select All'}
              </button>
              {onStartProcessing && (
                <button 
                  className="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 h-7" 
                  disabled={selectedCount === 0}
                  onClick={handleStartProcessing}
                >
                  🚀 Start Processing
                </button>
              )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default FileExplorer;