import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient';
import { NaturalQueryPrompts } from '../types';

interface PromptsEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'naturalQuery' | 'rag' | 'vectorOperations';

const PromptsEditorDialog: React.FC<PromptsEditorDialogProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('naturalQuery');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Natural Query prompts
  const [scriptGeneration, setScriptGeneration] = useState('');
  const [humanize, setHumanize] = useState('');

  // Position and size state (как в NaturalQueryDialog)
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: 700, height: 600 });

  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const sizeStartRef = useRef({ width: 0, height: 0 });

  // Загрузка промптов при открытии
  useEffect(() => {
    if (isOpen) {
      loadPrompts();
    }
  }, [isOpen, activeTab]);

  const loadPrompts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.getPromptsCategory(activeTab);
      if (res.success) {
        const data = res.data as NaturalQueryPrompts;
        setScriptGeneration(data.scriptGeneration || '');
        setHumanize(data.humanize || '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load prompts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await apiClient.patchPromptsCategory(activeTab, {
        scriptGeneration,
        humanize,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save prompts');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReload = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.reloadPrompts();
      await loadPrompts();
    } catch (err: any) {
      setError(err.message || 'Failed to reload prompts');
    } finally {
      setIsLoading(false);
    }
  };

  // Drag handlers
  const onMouseDownDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('textarea')) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.preventDefault();
  };

  const onMouseDownResize = (e: React.MouseEvent) => {
    isResizingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    sizeStartRef.current = { width: size.width, height: size.height };
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        setPosition({
          x: e.clientX - dragStartRef.current.x,
          y: e.clientY - dragStartRef.current.y
        });
      } else if (isResizingRef.current) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;
        setSize({
          width: Math.max(500, sizeStartRef.current.width + deltaX),
          height: Math.max(400, sizeStartRef.current.height + deltaY)
        });
      }
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      isResizingRef.current = false;
    };
    if (isOpen) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-[100] flex flex-col pointer-events-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`
      }}
    >
      <div className="bg-slate-900/95 border border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden pointer-events-auto ring-1 ring-white/10 h-full relative">
        {/* Header */}
        <div
          onMouseDown={onMouseDownDrag}
          className="px-4 py-3 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center cursor-move select-none"
        >
          <div className="flex items-center gap-2">
            <div className="bg-purple-500/20 p-1.5 rounded">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide">Prompts Editor</h2>
            {saveSuccess && (
              <span className="text-[10px] text-green-400 font-bold animate-pulse ml-2">✓ Saved</span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 bg-slate-800/50 shrink-0">
          {(['naturalQuery', 'rag', 'vectorOperations'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-xs font-bold transition-all border-b-2 ${
                activeTab === tab
                  ? 'text-purple-400 border-purple-400 bg-purple-900/10'
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              {tab === 'naturalQuery' ? 'Natural Query' : tab === 'rag' ? 'RAG Chat' : 'Vector Ops'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : activeTab === 'naturalQuery' ? (
            <div className="space-y-4">
              {/* Script Generation Prompt */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">
                  Script Generation Prompt
                  <span className="ml-2 text-purple-400 font-normal">Плейсхолдер: {'{question}'}</span>
                </label>
                <textarea
                  value={scriptGeneration}
                  onChange={(e) => setScriptGeneration(e.target.value)}
                  className="w-full h-48 bg-slate-950 border border-slate-600 rounded-lg p-3 text-xs text-slate-200 font-mono leading-relaxed focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none resize-none"
                  placeholder="Enter the prompt for script generation..."
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Используется для генерации JS-скриптов из вопроса пользователя
                </p>
              </div>

              {/* Humanize Prompt */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">
                  Humanize Prompt
                  <span className="ml-2 text-purple-400 font-normal">Плейсхолдеры: {'{question}'}, {'{rawData}'}</span>
                </label>
                <textarea
                  value={humanize}
                  onChange={(e) => setHumanize(e.target.value)}
                  className="w-full h-48 bg-slate-950 border border-slate-600 rounded-lg p-3 text-xs text-slate-200 font-mono leading-relaxed focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none resize-none"
                  placeholder="Enter the prompt for humanizing raw data..."
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Используется для превращения raw данных в человекочитаемый текст
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              Редактирование {activeTab} пока не реализовано
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/50 flex justify-between items-center">
          <button
            onClick={handleReload}
            disabled={isLoading || isSaving}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 bg-slate-700/50 hover:bg-slate-700 px-3 py-1.5 rounded transition-colors border border-slate-600 disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reload from file
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || isSaving}
            className="text-xs text-white bg-purple-600 hover:bg-purple-500 px-4 py-1.5 rounded font-bold transition-colors shadow-md disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSaving ? (
              <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            Save Changes
          </button>
        </div>

        {/* Resize Handle */}
        <div
          onMouseDown={onMouseDownResize}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-[101] flex items-end justify-end p-0.5"
        >
          <svg className="w-2.5 h-2.5 text-slate-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 22h-2v-2h2v2zM22 18h-2v-2h2v2zM18 22h-2v-2h2v2zM18 18h-2v-2h2v2zM14 22h-2v-2h2v2zM22 14h-2v-2h2v2z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default PromptsEditorDialog;
