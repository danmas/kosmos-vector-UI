import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal, Code, Cpu, AlertCircle, Play, RefreshCcw, Wand2, X, Copy, Check, FileText, Download, Upload, Move } from 'lucide-react';
import { AiItem, FunctionMetadata, LogicAnalysisResponse } from '../types';
import { analyzeFunctionLogic, analyzeFunctionLogicFromMetadata } from '../services/logicAnalyzerService';
import { apiClient } from '../services/apiClient';
import LogicVisualizer from './LogicVisualizer';

interface LogicArchitectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  item: AiItem | null;
}

const LogicArchitectDialog: React.FC<LogicArchitectDialogProps> = ({ isOpen, onClose, item }) => {
  const [inputText, setInputText] = useState<string>('');
  const [graph, setGraph] = useState<LogicAnalysisResponse['graph'] | null>(null);
  const [logicDescription, setLogicDescription] = useState<string>('');
  const [rawResponse, setRawResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isLoadingGraph, setIsLoadingGraph] = useState<boolean>(false);
  const [isSavingGraph, setIsSavingGraph] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [showCodePreview, setShowCodePreview] = useState<boolean>(false);
  const [showDescriptionEditor, setShowDescriptionEditor] = useState<boolean>(false);
  const [leftPanelMode, setLeftPanelMode] = useState<'json' | 'code'>('code'); // 'json' или 'code'
  
  // Состояние для перемещаемого/изменяемого окна Code Preview
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 });
  const [previewSize, setPreviewSize] = useState({ width: 800, height: window.innerHeight - 80 });
  
  // Состояние для диалога редактирования описания
  const [descEditorPos, setDescEditorPos] = useState({ x: 0, y: 0 });
  const [descEditorSize, setDescEditorSize] = useState({ width: 700, height: 500 });
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [activeDialog, setActiveDialog] = useState<'code' | 'desc' | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const previewRef = useRef<HTMLDivElement>(null);

  const handleLoadGraph = useCallback(async (silent: boolean = false) => {
    if (!item?.id) {
      if (!silent) {
        setError("No item selected for loading");
      }
      return;
    }

    setIsLoadingGraph(true);
    if (!silent) {
      setError(null);
    }
    try {
      const response = await apiClient.getLogicGraph(item.id);
      // Заполняем данные из сохраненного анализа
      setGraph(response.logicGraph.graph);
      setLogicDescription(response.logicGraph.logic);
      setRawResponse(JSON.stringify(response.logicGraph, null, 2));
    } catch (err: any) {
      if (err.status === 404) {
        // 404 - это нормально при первом открытии, не показываем ошибку при автозагрузке
        if (!silent) {
          setError("Logic analysis not found on server for this item");
        }
      } else {
        if (!silent) {
          setError(err.message || "Error loading logic analysis");
        }
      }
      console.error("Load Graph Error:", err);
    } finally {
      setIsLoadingGraph(false);
    }
  }, [item?.id]);

  // Инициализация inputText из item.l0_code при открытии диалога
  useEffect(() => {
    if (isOpen && item) {
      // Формируем JSON из AiItem
      const metadata: FunctionMetadata = {
        body: item.l0_code,
        s_name: item.id,
        full_name: item.id,
        comment: item.l2_desc,
        called_functions: item.l1_deps
      };
      setInputText(JSON.stringify(metadata, null, 2));
      setGraph(null);
      setLogicDescription('');
      setRawResponse('');
      setError(null);
    }
  }, [isOpen, item]);

  // Автоматическая загрузка сохраненных данных при открытии диалога
  useEffect(() => {
    if (isOpen && item?.id) {
      handleLoadGraph(true);
    }
  }, [isOpen, item?.id, handleLoadGraph]);

  const sanitizeAndParse = (text: string): any => {
    let cleaned = text.trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    const escaped = cleaned.replace(/"([^"\\]*(\\.[^"\\]*)*)"/gs, (match) => {
      return match
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    });

    try {
      return JSON.parse(escaped);
    } catch (e) {
      const objects: any[] = [];
      const regex = /\{(?:[^{}]|(\{(?:[^{}]|(\{[^{}]*\}))*\})*)\}/g;
      let m;
      while ((m = regex.exec(escaped)) !== null) {
        try {
          objects.push(JSON.parse(m[0]));
        } catch (innerE) {}
      }
      
      if (objects.length > 0) {
        return objects.reduce((acc, curr) => ({ ...acc, ...curr }), {});
      }
      throw new Error("Failed to parse JSON. Check syntax.");
    }
  };

  const handleProcess = async () => {
    if (!inputText.trim()) {
      setError("Please enter JSON function description");
      return;
    }

    setIsLoading(true);
    setError(null);
    setRawResponse('');
    setLogicDescription('');
    try {
      const parsed = sanitizeAndParse(inputText);
      
      if (!parsed.body) {
        throw new Error("JSON must contain 'body' field with function source code.");
      }
      
      const response: LogicAnalysisResponse = await analyzeFunctionLogicFromMetadata(parsed as FunctionMetadata);
      setGraph(response.graph);
      setLogicDescription(response.logic);
      setRawResponse(JSON.stringify(response, null, 2));
      
      // Автоматическое сохранение после успешного анализа
      if (item?.id) {
        try {
          setIsSavingGraph(true);
          setSaveSuccess(false);
          await apiClient.saveLogicGraph(item.id, response);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        } catch (saveErr: any) {
          // Не блокируем работу, если сохранение не удалось, но логируем ошибку
          console.error("Auto-save error:", saveErr);
        } finally {
          setIsSavingGraph(false);
        }
      }
    } catch (err: any) {
      setError(err.message || "Error analyzing code.");
      console.error("Parse Error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormat = () => {
    try {
      const parsed = sanitizeAndParse(inputText);
      setInputText(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch (err: any) {
      setError("Formatting error: " + err.message);
    }
  };

  // Извлечение body из JSON с правильной обработкой переводов строк
  const extractBody = (): string => {
    try {
      const parsed = sanitizeAndParse(inputText);
      if (parsed.body) {
        let body = parsed.body;
        // Если body - это JSON строка, попробуем извлечь вложенный body
        if (body.startsWith('{') && body.includes('"body"')) {
          try {
            const innerParsed = JSON.parse(body);
            if (innerParsed.body) {
              body = innerParsed.body;
            }
          } catch {
            // Оставляем как есть
          }
        }
        // Нормализуем переводы строк: \r\n -> \n, \r -> \n (один раз)
        return body
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n');
      }
      return '';
    } catch {
      return '';
    }
  };

  // Центрирование окна Code Preview при открытии с максимальной высотой
  useEffect(() => {
    if (showCodePreview) {
      const maxHeight = window.innerHeight - 80;
      setPreviewSize(prev => ({ ...prev, height: maxHeight }));
      const centerX = (window.innerWidth - previewSize.width) / 2;
      const centerY = 40;
      setPreviewPos({ x: centerX, y: centerY });
    }
  }, [showCodePreview]);

  // Центрирование окна редактирования описания при открытии
  useEffect(() => {
    if (showDescriptionEditor) {
      const centerX = (window.innerWidth - descEditorSize.width) / 2;
      const centerY = (window.innerHeight - descEditorSize.height) / 2;
      setDescEditorPos({ x: centerX, y: centerY });
    }
  }, [showDescriptionEditor]);

  // Обработчики перемещения и изменения размера
  const handleMouseDown = (e: React.MouseEvent, action: 'drag' | string, dialog: 'code' | 'desc') => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDialog(dialog);
    
    const currentPos = dialog === 'code' ? previewPos : descEditorPos;
    
    if (action === 'drag') {
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - currentPos.x,
        y: e.clientY - currentPos.y
      };
    } else {
      setIsResizing(action);
      dragOffset.current = { x: e.clientX, y: e.clientY };
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const setPos = activeDialog === 'code' ? setPreviewPos : setDescEditorPos;
      const setSize = activeDialog === 'code' ? setPreviewSize : setDescEditorSize;
      const currentSize = activeDialog === 'code' ? previewSize : descEditorSize;
      
      if (isDragging) {
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - currentSize.width, e.clientX - dragOffset.current.x)),
          y: Math.max(0, Math.min(window.innerHeight - currentSize.height, e.clientY - dragOffset.current.y))
        });
      } else if (isResizing) {
        const dx = e.clientX - dragOffset.current.x;
        const dy = e.clientY - dragOffset.current.y;
        dragOffset.current = { x: e.clientX, y: e.clientY };

        setSize(prev => {
          let newWidth = prev.width;
          let newHeight = prev.height;
          
          if (isResizing.includes('e')) newWidth = Math.max(400, prev.width + dx);
          if (isResizing.includes('w')) {
            newWidth = Math.max(400, prev.width - dx);
            if (newWidth !== prev.width) {
              setPos(p => ({ ...p, x: p.x + dx }));
            }
          }
          if (isResizing.includes('s')) newHeight = Math.max(200, prev.height + dy);
          if (isResizing.includes('n')) {
            newHeight = Math.max(200, prev.height - dy);
            if (newHeight !== prev.height) {
              setPos(p => ({ ...p, y: p.y + dy }));
            }
          }
          
          return { width: newWidth, height: newHeight };
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
      setActiveDialog(null);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, activeDialog, previewSize, descEditorSize]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(rawResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveGraph = async () => {
    if (!item?.id) {
      setError("No item selected for saving");
      return;
    }

    if (!graph || !logicDescription) {
      setError("No data to save. First perform logic analysis.");
      return;
    }

    setIsSavingGraph(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const analysis: LogicAnalysisResponse = {
        logic: logicDescription,
        graph: graph
      };
      await apiClient.saveLogicGraph(item.id, analysis);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "Error saving logic analysis");
      console.error("Save Graph Error:", err);
    } finally {
      setIsSavingGraph(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/20">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Logic Architect <span className="text-[10px] font-normal px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-indigo-400 uppercase tracking-wider">Gemini 3 Flash</span>
              </h2>
              <p className="text-xs text-slate-400">
                {item ? `Analysis: ${item.id}` : 'Visualization of function and stored procedure logic'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden p-1.5 gap-1.5">
          {/* Left Panel: JSON Editor / Code View */}
          <div className="w-1/3 flex flex-col gap-2">
            <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-2 py-1 bg-slate-800/50 border-b border-slate-800">
                {/* Mode Toggle */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setLeftPanelMode('code')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      leftPanelMode === 'code' 
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30' 
                        : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Code className="w-3 h-3" />
                    Code
                  </button>
                  <button
                    onClick={() => setLeftPanelMode('json')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      leftPanelMode === 'json' 
                        ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30' 
                        : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Terminal className="w-3 h-3" />
                    JSON
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {leftPanelMode === 'json' && (
                    <button 
                      onClick={handleFormat}
                      title="Fix and format JSON"
                      className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button 
                    onClick={() => setShowCodePreview(true)}
                    title="View in popup"
                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                  >
                    <Move className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 relative">
                {leftPanelMode === 'json' ? (
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder='Paste your JSON here...'
                    className="absolute inset-0 w-full h-full p-2 bg-transparent font-mono text-sm focus:outline-none resize-none placeholder:text-slate-700 scroll-smooth text-slate-200"
                  />
                ) : (
                  <pre className="absolute inset-0 w-full h-full p-2 overflow-auto font-mono text-sm text-slate-200 whitespace-pre-wrap">
                    {extractBody() || 'No source code found'}
                  </pre>
                )}
              </div>

              {error && (
                <div className="mx-4 mb-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-md flex items-start gap-2 text-rose-400 text-xs animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="p-2 border-t border-slate-800 bg-slate-900/80">
                <button
                  onClick={handleProcess}
                  disabled={isLoading}
                  className={`w-full py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 font-semibold transition-all shadow-lg active:scale-[0.98] text-sm ${
                    isLoading 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <RefreshCcw className="w-4 h-4 animate-spin" />
                      Analyzing logic...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Build logic
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Description Panel */}
            <div className="h-64 bg-slate-900 border border-slate-800 rounded-xl shadow-xl flex flex-col overflow-hidden">
              {/* Header - не скролится */}
              <div className="flex items-center justify-between px-2 py-1 bg-slate-800/50 border-b border-slate-800 shrink-0">
                <h3 className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                  <FileText className="w-2.5 h-2.5" />
                  Logic Description
                </h3>
                <div className="flex items-center gap-1">
                  {item?.id && (
                    <>
                      <button 
                        onClick={() => handleLoadGraph(false)}
                        disabled={isLoadingGraph || isLoading}
                        className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-[8px] font-bold text-emerald-400 transition-colors uppercase border border-slate-700"
                        title="Load saved analysis from server"
                      >
                        {isLoadingGraph ? (
                          <RefreshCcw className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <Download className="w-2.5 h-2.5" />
                        )}
                        {isLoadingGraph ? '...' : 'Load'}
                      </button>
                      <button 
                        onClick={handleSaveGraph}
                        disabled={isSavingGraph || isLoading || !graph || !logicDescription}
                        className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-[8px] font-bold text-blue-400 transition-colors uppercase border border-slate-700"
                        title="Save analysis to server"
                      >
                        {isSavingGraph ? (
                          <RefreshCcw className="w-2.5 h-2.5 animate-spin" />
                        ) : saveSuccess ? (
                          <Check className="w-2.5 h-2.5" />
                        ) : (
                          <Upload className="w-2.5 h-2.5" />
                        )}
                        {isSavingGraph ? '...' : saveSuccess ? 'OK' : 'Save'}
                      </button>
                    </>
                  )}
                  {rawResponse && (
                    <button 
                      onClick={copyToClipboard}
                      className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[8px] font-bold text-indigo-400 transition-colors uppercase border border-slate-700"
                      title="Copy JSON to clipboard"
                    >
                      {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                      {copied ? 'OK' : 'JSON'}
                    </button>
                  )}
                  <button 
                    onClick={() => setShowDescriptionEditor(true)}
                    title="Edit in popup"
                    className="p-0.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                  >
                    <Move className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
              {/* Content - скролится */}
              <div className="flex-1 overflow-y-auto p-2">
                {logicDescription ? (
                  <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">
                    {logicDescription}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-600 text-center py-4">
                    <Code className="w-6 h-6 mb-2 opacity-20" />
                    <p className="text-xs">Text description will appear after analysis</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Visualizer */}
          <div className="flex-1 flex flex-col shadow-2xl">
            <LogicVisualizer graph={graph} isLoading={isLoading} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-2 border-t border-slate-800 bg-slate-900/30 text-[10px] text-slate-500 flex justify-between">
          <div className="flex items-center gap-4">
            <span>Support: PL/pgSQL, JS/TS, Python</span>
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div> 
              Gemini Reasoning Engine Online
            </span>
          </div>
          <div>Logic Architect v1.0.8</div>
        </div>
      </div>

      {/* Code Preview Dialog - Resizable & Draggable */}
      {showCodePreview && (
        <div 
          className="fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-sm"
          onClick={() => setShowCodePreview(false)}
        >
          <div 
            ref={previewRef}
            className="absolute bg-slate-900 border border-slate-700 rounded-xl flex flex-col shadow-2xl overflow-hidden"
            style={{
              left: previewPos.x,
              top: previewPos.y,
              width: previewSize.width,
              height: previewSize.height,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Resize handles */}
            <div className="absolute top-0 left-0 w-2 h-full cursor-w-resize hover:bg-indigo-500/20" onMouseDown={(e) => handleMouseDown(e, 'w', 'code')} />
            <div className="absolute top-0 right-0 w-2 h-full cursor-e-resize hover:bg-indigo-500/20" onMouseDown={(e) => handleMouseDown(e, 'e', 'code')} />
            <div className="absolute top-0 left-0 h-2 w-full cursor-n-resize hover:bg-indigo-500/20" onMouseDown={(e) => handleMouseDown(e, 'n', 'code')} />
            <div className="absolute bottom-0 left-0 h-2 w-full cursor-s-resize hover:bg-indigo-500/20" onMouseDown={(e) => handleMouseDown(e, 's', 'code')} />
            <div className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize hover:bg-indigo-500/30" onMouseDown={(e) => handleMouseDown(e, 'nw', 'code')} />
            <div className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize hover:bg-indigo-500/30" onMouseDown={(e) => handleMouseDown(e, 'ne', 'code')} />
            <div className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize hover:bg-indigo-500/30" onMouseDown={(e) => handleMouseDown(e, 'sw', 'code')} />
            <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize hover:bg-indigo-500/30" onMouseDown={(e) => handleMouseDown(e, 'se', 'code')} />

            {/* Header - Draggable */}
            <div 
              className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-800/50 cursor-move select-none"
              onMouseDown={(e) => handleMouseDown(e, 'drag', 'code')}
            >
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Code className="w-4 h-4 text-emerald-400" />
                Source Code Preview
                <Move className="w-3 h-3 text-slate-500 ml-2" />
              </h3>
              <button 
                onClick={() => setShowCodePreview(false)}
                className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Content */}
            <pre className="flex-1 p-4 overflow-auto text-sm text-slate-200 font-mono whitespace-pre-wrap bg-slate-950/50">
              {extractBody() || 'No source code found in body field'}
            </pre>
            
            {/* Resize indicator */}
            <div className="absolute bottom-1 right-1 w-3 h-3 border-r-2 border-b-2 border-slate-600 opacity-50" />
          </div>
        </div>
      )}

      {/* Description Editor Dialog - Resizable & Draggable */}
      {showDescriptionEditor && (
        <div 
          className="fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-sm"
          onClick={() => setShowDescriptionEditor(false)}
        >
          <div 
            className="absolute bg-slate-900 border border-slate-700 rounded-xl flex flex-col shadow-2xl overflow-hidden"
            style={{
              left: descEditorPos.x,
              top: descEditorPos.y,
              width: descEditorSize.width,
              height: descEditorSize.height,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Resize handles */}
            <div className="absolute top-0 left-0 w-2 h-full cursor-w-resize hover:bg-blue-500/20" onMouseDown={(e) => handleMouseDown(e, 'w', 'desc')} />
            <div className="absolute top-0 right-0 w-2 h-full cursor-e-resize hover:bg-blue-500/20" onMouseDown={(e) => handleMouseDown(e, 'e', 'desc')} />
            <div className="absolute top-0 left-0 h-2 w-full cursor-n-resize hover:bg-blue-500/20" onMouseDown={(e) => handleMouseDown(e, 'n', 'desc')} />
            <div className="absolute bottom-0 left-0 h-2 w-full cursor-s-resize hover:bg-blue-500/20" onMouseDown={(e) => handleMouseDown(e, 's', 'desc')} />
            <div className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize hover:bg-blue-500/30" onMouseDown={(e) => handleMouseDown(e, 'nw', 'desc')} />
            <div className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize hover:bg-blue-500/30" onMouseDown={(e) => handleMouseDown(e, 'ne', 'desc')} />
            <div className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize hover:bg-blue-500/30" onMouseDown={(e) => handleMouseDown(e, 'sw', 'desc')} />
            <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize hover:bg-blue-500/30" onMouseDown={(e) => handleMouseDown(e, 'se', 'desc')} />

            {/* Header - Draggable */}
            <div 
              className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-800/50 cursor-move select-none"
              onMouseDown={(e) => handleMouseDown(e, 'drag', 'desc')}
            >
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                Logic Description Editor
                <Move className="w-3 h-3 text-slate-500 ml-2" />
              </h3>
              <button 
                onClick={() => setShowDescriptionEditor(false)}
                className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Content - Editable textarea */}
            <textarea
              value={logicDescription}
              onChange={(e) => setLogicDescription(e.target.value)}
              placeholder="Enter logic description..."
              className="flex-1 p-4 bg-slate-950/50 text-sm text-slate-200 leading-relaxed resize-none focus:outline-none"
            />
            
            {/* Resize indicator */}
            <div className="absolute bottom-1 right-1 w-3 h-3 border-r-2 border-b-2 border-slate-600 opacity-50" />
          </div>
        </div>
      )}
    </div>
  );
};

export default LogicArchitectDialog;

