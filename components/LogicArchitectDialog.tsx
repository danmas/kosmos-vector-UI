import React, { useState, useEffect, useCallback } from 'react';
import { Terminal, Code, Cpu, AlertCircle, Play, RefreshCcw, Wand2, X, Copy, Check, FileText, Download, Upload } from 'lucide-react';
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

  const handleLoadGraph = useCallback(async (silent: boolean = false) => {
    if (!item?.id) {
      if (!silent) {
        setError("Не выбран элемент для загрузки");
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
          setError("Анализ логики не найден на сервере для данного элемента");
        }
      } else {
        if (!silent) {
          setError(err.message || "Ошибка при загрузке анализа логики");
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
      throw new Error("Не удалось распознать JSON. Проверьте синтаксис.");
    }
  };

  const handleProcess = async () => {
    if (!inputText.trim()) {
      setError("Пожалуйста, введите JSON описание функции");
      return;
    }

    setIsLoading(true);
    setError(null);
    setRawResponse('');
    setLogicDescription('');
    try {
      const parsed = sanitizeAndParse(inputText);
      
      if (!parsed.body) {
        throw new Error("JSON должен содержать поле 'body' с исходным кодом функции.");
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
      setError(err.message || "Ошибка при анализе кода.");
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
      setError("Ошибка форматирования: " + err.message);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(rawResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveGraph = async () => {
    if (!item?.id) {
      setError("Не выбран элемент для сохранения");
      return;
    }

    if (!graph || !logicDescription) {
      setError("Нет данных для сохранения. Сначала выполните анализ логики.");
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
      setError(err.message || "Ошибка при сохранении анализа логики");
      console.error("Save Graph Error:", err);
    } finally {
      setIsSavingGraph(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/20">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Logic Architect <span className="text-[10px] font-normal px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-indigo-400 uppercase tracking-wider">Gemini 3 Flash</span>
              </h2>
              <p className="text-xs text-slate-400">
                {item ? `Анализ: ${item.id}` : 'Визуализация логики функций и хранимых процедур'}
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
        <div className="flex flex-1 overflow-hidden p-6 gap-6">
          {/* Left Panel: JSON Editor */}
          <div className="w-1/3 flex flex-col gap-4">
            <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-800">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  Входной JSON дескриптор
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleFormat}
                    title="Исправить и отформатировать JSON"
                    className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder='Вставьте ваш JSON здесь...'
                  className="absolute inset-0 w-full h-full p-4 bg-transparent font-mono text-sm focus:outline-none resize-none placeholder:text-slate-700 scroll-smooth text-slate-200"
                />
              </div>

              {error && (
                <div className="mx-4 mb-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-md flex items-start gap-2 text-rose-400 text-xs animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="p-4 border-t border-slate-800 bg-slate-900/80">
                <button
                  onClick={handleProcess}
                  disabled={isLoading}
                  className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 font-semibold transition-all shadow-lg active:scale-[0.98] ${
                    isLoading 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <RefreshCcw className="w-5 h-5 animate-spin" />
                      Анализ логики...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Визуализировать
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Description Panel */}
            <div className="h-64 bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-y-auto shadow-xl flex flex-col">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h3 className="text-xs font-bold uppercase text-slate-500 flex items-center gap-2">
                  <FileText className="w-3 h-3" />
                  Описание логики
                </h3>
                <div className="flex items-center gap-2">
                  {item?.id && (
                    <>
                      <button 
                        onClick={handleLoadGraph}
                        disabled={isLoadingGraph || isLoading}
                        className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-[10px] font-bold text-emerald-400 transition-colors uppercase border border-slate-700"
                        title="Загрузить сохраненный анализ с сервера"
                      >
                        {isLoadingGraph ? (
                          <RefreshCcw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        {isLoadingGraph ? 'Загрузка...' : 'Загрузить'}
                      </button>
                      <button 
                        onClick={handleSaveGraph}
                        disabled={isSavingGraph || isLoading || !graph || !logicDescription}
                        className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-[10px] font-bold text-blue-400 transition-colors uppercase border border-slate-700"
                        title="Сохранить анализ на сервер"
                      >
                        {isSavingGraph ? (
                          <RefreshCcw className="w-3 h-3 animate-spin" />
                        ) : saveSuccess ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Upload className="w-3 h-3" />
                        )}
                        {isSavingGraph ? 'Сохранение...' : saveSuccess ? 'Сохранено' : 'Сохранить'}
                      </button>
                    </>
                  )}
                  {rawResponse && (
                    <button 
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px] font-bold text-indigo-400 transition-colors uppercase border border-slate-700"
                      title="Копировать JSON в буфер обмена"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Скопировано' : 'Копировать JSON'}
                    </button>
                  )}
                </div>
              </div>
              {logicDescription ? (
                <div className="flex-1 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-medium">
                  {logicDescription}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-slate-600 text-center py-4">
                  <Code className="w-6 h-6 mb-2 opacity-20" />
                  <p className="text-xs">Текстовое описание появится после анализа</p>
                </div>
              )}
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
            <span>Поддержка: PL/pgSQL, JS/TS, Python</span>
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div> 
              Gemini Reasoning Engine Online
            </span>
          </div>
          <div>Logic Architect v1.0.8</div>
        </div>
      </div>
    </div>
  );
};

export default LogicArchitectDialog;

