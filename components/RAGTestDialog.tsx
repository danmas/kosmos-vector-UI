import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/apiClient';
import { useDataCache } from '../lib/context/DataCacheContext';
import type { 
  RAGStrategy, 
  FormattingStyle, 
  RAGRetrieveResponse,
  RAGContextMetadata,
  ChatMessage
} from '../types';

interface RAGTestDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const RAGTestDialog: React.FC<RAGTestDialogProps> = ({ isOpen, onClose }) => {
  const { currentContextCode } = useDataCache();
  const [activeTab, setActiveTab] = useState<'input' | 'result' | 'chat'>('input');

  // Dialog position and size
  const [position, setPosition] = useState({ x: 100, y: 40 });
  const [size, setSize] = useState({ width: 900, height: 420 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);

  // Input state
  const [query, setQuery] = useState('');
  const [strategy, setStrategy] = useState<RAGStrategy>('hierarchical');
  const [maxChunks, setMaxChunks] = useState(5);
  const [formattingStyle, setFormattingStyle] = useState<FormattingStyle>('standard');
  const [maxTokens, setMaxTokens] = useState(4000);
  const [includeRelations, setIncludeRelations] = useState(true);

  // Result state
  const [loading, setLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RAGRetrieveResponse | null>(null);
  const [chatResult, setChatResult] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setActiveTab('input');
    }
  }, [isOpen]);

  // Mouse move handler for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, dragStart]);

  // Start dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  // Resize handlers
  const handleResizeMouseDown = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;
    const startPosX = position.x;
    const startPosY = position.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (direction.includes('e')) {
        setSize(prev => ({ ...prev, width: Math.max(400, startWidth + deltaX) }));
      }
      if (direction.includes('w')) {
        const newWidth = Math.max(400, startWidth - deltaX);
        setSize(prev => ({ ...prev, width: newWidth }));
        setPosition(prev => ({ ...prev, x: startPosX + (startWidth - newWidth) }));
      }
      if (direction.includes('s')) {
        setSize(prev => ({ ...prev, height: Math.max(300, startHeight + deltaY) }));
      }
      if (direction.includes('n')) {
        const newHeight = Math.max(300, startHeight - deltaY);
        setSize(prev => ({ ...prev, height: newHeight }));
        setPosition(prev => ({ ...prev, y: startPosY + (startHeight - newHeight) }));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleRetrieve = async () => {
    if (!query.trim()) {
      setError('Введите вопрос');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const requestPayload = {
        query: query.trim(),
        contextCode: currentContextCode || 'CARL',
        strategy,
        maxChunks,
        includeRelations,
        formatting: {
          style: formattingStyle,
          maxTokens,
          includeFileNames: true,
          includeRelations,
        },
      };

      console.log('[RAGTestDialog] Sending request:', requestPayload);

      const response = await apiClient.ragRetrieve(requestPayload);

      console.log('[RAGTestDialog] Received response:', response);

      // Проверяем структуру ответа
      if (!response || !response.context || !response.context.metadata) {
        throw new Error('Некорректный ответ от сервера: отсутствуют обязательные поля');
      }

      // Защита от undefined значений
      const safeResponse = {
        ...response,
        context: {
          ...response.context,
          formatted: response.context.formatted || '',
          sections: response.context.sections || [],
          metadata: {
            ...response.context.metadata,
            usedChunkIds: response.context.metadata.usedChunkIds || [],
          },
        },
      };

      setResult(safeResponse);
      setActiveTab('result');
    } catch (err) {
      console.error('[RAGTestDialog] RAG retrieve error:', err);
      
      let errorMessage = 'Ошибка получения контекста';
      
      if (err instanceof Error) {
        errorMessage = err.message;
        console.error('[RAGTestDialog] Error details:', {
          message: err.message,
          stack: err.stack,
        });
      } else if (typeof err === 'object' && err !== null) {
        // Если это объект ошибки от API
        const apiError = err as any;
        if (apiError.message) {
          errorMessage = apiError.message;
        } else if (apiError.error) {
          errorMessage = apiError.error;
        }
        console.error('[RAGTestDialog] API error object:', err);
      } else {
        console.error('[RAGTestDialog] Unknown error:', err);
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async () => {
    if (!query.trim()) {
      setError('Введите вопрос');
      return;
    }

    setChatLoading(true);
    setError(null);

    try {
      // Формируем запрос: текст вопроса + подготовленный RAG контекст
      const contextText = result ? result.context.formatted : '';
      const combinedMessage = `Вопрос: ${query.trim()}\n\nКонтекст (RAG):\n${contextText}`;

      console.log('[RAGTestDialog] Sending Chat request:', { message: combinedMessage });

      const response = await apiClient.chat(combinedMessage);

      console.log('[RAGTestDialog] Received Chat response:', response);

      setChatResult(response.response);
      setActiveTab('chat');

      // Добавляем сообщение в основной чат RAG Assistant
      const userMsg: ChatMessage = {
        id: `rag-user-${Date.now()}`,
        role: 'user',
        text: combinedMessage,
        timestamp: Date.now()
      };

      const modelMsg: ChatMessage = {
        id: `rag-model-${Date.now() + 1}`,
        role: 'model',
        text: response.response,
        timestamp: Date.now()
      };

      const event = new CustomEvent('add-rag-chat-messages', {
        detail: { userMsg, modelMsg }
      });
      window.dispatchEvent(event);
    } catch (err) {
      console.error('[RAGTestDialog] Chat error:', err);
      let errorMessage = 'Ошибка при обращении к чату';
      if (err instanceof Error) errorMessage = err.message;
      setError(errorMessage);
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleRetrieve();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={dialogRef}
      className="fixed bg-slate-800 border-2 border-slate-600 rounded-lg shadow-2xl flex flex-col"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: 9999,
        cursor: isDragging ? 'move' : 'default',
      }}
    >
      {/* Resize handles */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Corners */}
        <div 
          className="absolute top-0 left-0 w-3 h-3 pointer-events-auto cursor-nw-resize"
          onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
        />
        <div 
          className="absolute top-0 right-0 w-3 h-3 pointer-events-auto cursor-ne-resize"
          onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
        />
        <div 
          className="absolute bottom-0 left-0 w-3 h-3 pointer-events-auto cursor-sw-resize"
          onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
        />
        <div 
          className="absolute bottom-0 right-0 w-3 h-3 pointer-events-auto cursor-se-resize"
          onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
        />
        
        {/* Edges */}
        <div 
          className="absolute top-0 left-3 right-3 h-1 pointer-events-auto cursor-n-resize"
          onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
        />
        <div 
          className="absolute bottom-0 left-3 right-3 h-1 pointer-events-auto cursor-s-resize"
          onMouseDown={(e) => handleResizeMouseDown(e, 's')}
        />
        <div 
          className="absolute left-0 top-3 bottom-3 w-1 pointer-events-auto cursor-w-resize"
          onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
        />
        <div 
          className="absolute right-0 top-3 bottom-3 w-1 pointer-events-auto cursor-e-resize"
          onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
        />
      </div>

      {/* Header - draggable */}
      <div 
        className="drag-handle flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800/80 shrink-0 cursor-move"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
          <span className="text-white font-bold text-sm">RAG Test</span>
          <span className="text-slate-400 text-xs">({currentContextCode || 'CARL'})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRetrieve}
            disabled={loading || chatLoading || !query.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold px-3 py-1 rounded text-xs transition-colors flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Retrieving...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Retrieve
              </>
            )}
          </button>
          <button
            onClick={handleChat}
            disabled={loading || chatLoading || !query.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold px-3 py-1 rounded text-xs transition-colors flex items-center gap-1.5"
          >
            {chatLoading ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Chatting...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                Chat
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700 bg-slate-800/50 shrink-0">
        <button
          onClick={() => setActiveTab('input')}
          className={`px-4 py-1.5 text-xs font-bold transition-colors ${
            activeTab === 'input'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-900/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          Input
        </button>
        <button
          onClick={() => setActiveTab('result')}
          className={`px-4 py-1.5 text-xs font-bold transition-colors ${
            activeTab === 'result'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-900/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          Result
          {result && (
            <span className="ml-1 text-[10px] bg-green-600/30 text-green-400 px-1 rounded">
              {result.context.metadata.totalChunks}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-1.5 text-xs font-bold transition-colors ${
            activeTab === 'chat'
              ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-900/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          Chat
          {chatResult && (
            <span className="ml-1 w-2 h-2 bg-purple-500 rounded-full inline-block"></span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === 'input' && (
          <div className="flex-1 flex flex-col p-3 gap-3 overflow-y-auto">
            {/* Query */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-bold">Вопрос (Ctrl+Enter для отправки)</label>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Как работает функция validateEmployee?"
                className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none resize-none"
                rows={4}
              />
            </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Strategy */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-bold">Стратегия</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as RAGStrategy)}
                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                >
                  <option value="simple">Simple (быстрая)</option>
                  <option value="hierarchical">Hierarchical (рек.)</option>
                  <option value="aiitem">AI Item (полный)</option>
                  <option value="hybrid">Hybrid (эксп.)</option>
                </select>
              </div>

              {/* Max Chunks */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-bold">Чанков: {maxChunks}</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={maxChunks}
                  onChange={(e) => setMaxChunks(parseInt(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              {/* Formatting Style */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-bold">Формат</label>
                <select
                  value={formattingStyle}
                  onChange={(e) => setFormattingStyle(e.target.value as FormattingStyle)}
                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                >
                  <option value="compact">Compact</option>
                  <option value="standard">Standard</option>
                  <option value="full">Full</option>
                  <option value="markdown">Markdown</option>
                </select>
              </div>

              {/* Max Tokens */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-bold">Max Tokens</label>
                <input
                  type="number"
                  min="500"
                  max="16000"
                  step="500"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Include Relations */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeRelations"
                checked={includeRelations}
                onChange={(e) => setIncludeRelations(e.target.checked)}
                className="accent-blue-500"
              />
              <label htmlFor="includeRelations" className="text-xs text-slate-300">
                Включить связи (relations)
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-900/20 border border-red-700/30 rounded px-3 py-2">
                <div className="text-sm text-red-400 font-bold mb-1">Ошибка</div>
                <div className="text-xs text-red-300 whitespace-pre-wrap font-mono">{error}</div>
              </div>
            )}

          </div>
        )}

        {activeTab === 'result' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {result ? (
              <>
                {/* Metadata Bar */}
                <div className="flex items-center gap-4 px-2 py-1.5 bg-slate-900/50 border-b border-slate-700 text-xs shrink-0 flex-wrap">
                  <span className="text-slate-400">
                    Чанков: <span className="text-white font-bold">{result.context.metadata.totalChunks}</span>
                  </span>
                  <span className="text-slate-400">
                    Токенов: <span className="text-white font-bold">{result.context.metadata.totalTokens.toLocaleString()}</span>
                  </span>
                  <span className="text-slate-400">
                    Время: <span className="text-white font-bold">{result.retrievalTime}ms</span>
                  </span>
                  <span className="text-slate-400">
                    Стратегия: <span className="text-cyan-400 font-bold">{result.context.metadata.strategy}</span>
                  </span>
                  <span className="text-slate-400">
                    Формат: <span className="text-purple-400 font-bold">{result.context.metadata.formattingStyle}</span>
                  </span>
                </div>

                {/* Formatted Context */}
                <div className="flex-1 overflow-y-auto p-2 min-h-0">
                  <pre className="text-xs text-slate-200 whitespace-pre-wrap font-mono bg-slate-900 rounded p-2 border border-slate-700">
                    {result.context.formatted}
                  </pre>
                </div>

                {/* Used Chunk IDs */}
                {result.context.metadata.usedChunkIds.length > 0 && (
                  <div className="px-2 py-1.5 border-t border-slate-700 bg-slate-900/50 shrink-0">
                    <div className="text-[10px] text-slate-500 mb-1">Использованные chunk IDs:</div>
                    <div className="flex flex-wrap gap-1">
                      {result.context.metadata.usedChunkIds.map((id, i) => (
                        <span key={i} className="text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                Нет результатов. Выполните запрос во вкладке Input.
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {chatResult ? (
              <div className="flex-1 overflow-y-auto p-3 min-h-0 bg-slate-900/30">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed shadow-inner">
                  {chatResult}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                Нет ответа от LLM. Выполните Chat запрос.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RAGTestDialog;
