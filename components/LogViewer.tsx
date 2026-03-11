import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { ServerLog } from '../types';
import { uiLogger } from '../services/uiLogger';

interface LogViewerProps {
  autoScroll?: boolean;
  onAutoScrollChange?: (enabled: boolean) => void;
  showControls?: boolean;
}

export interface LogViewerHandle {
  clearLogs: () => void;
}

const LogViewer = forwardRef<LogViewerHandle, LogViewerProps>(({ 
  autoScroll: externalAutoScroll, 
  onAutoScrollChange,
  showControls = true 
}, ref) => {
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [internalAutoScroll, setInternalAutoScroll] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Use external autoScroll if provided, otherwise use internal state
  const autoScroll = externalAutoScroll !== undefined ? externalAutoScroll : internalAutoScroll;
  const setAutoScroll = onAutoScrollChange || setInternalAutoScroll;

  useEffect(() => {
    // EventSource не использует прокси Vite, поэтому нужен полный URL бэкенда
    const backendPort = import.meta.env.VITE_BACKEND_PORT || 3200;
    const backendUrl = `http://localhost:${backendPort}`;
    const eventSource = new EventSource(`${backendUrl}/api/logs/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          setIsConnected(true);
        } else if (data.type === 'log' && data.log) {
          // Помечаем логи от сервера
          const serverLog: ServerLog = {
            ...data.log,
            source: 'SERVER'
          };
          
          setLogs(prevLogs => {
            // Check if log already exists (avoid duplicates)
            const exists = prevLogs.some(log => log.id === serverLog.id);
            if (exists) {
              return prevLogs;
            }
            // Add new log at the end (chronological order)
            return [...prevLogs, serverLog];
          });
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      setIsConnected(false);
      
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          // Reconnection will be handled by useEffect
        }
      }, 3000);
    };

    // Подписка на UI логи (с автоматической отдачей буфера/истории)
    const unsubscribeUiLogger = uiLogger.subscribe((log) => {
      setLogs(prevLogs => {
        // Check if log already exists (avoid duplicates)
        const exists = prevLogs.some(l => l.id === log.id);
        if (exists) return prevLogs;
        // Add new log at the end (chronological order)
        return [...prevLogs, log];
      });
    });

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      unsubscribeUiLogger();
    };
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logs.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const clearLogs = () => {
    setLogs([]);
    setExpandedLogs(new Set());
    uiLogger.clearBuffer();
  };

  // Expose clearLogs to parent via ref
  useImperativeHandle(ref, () => ({
    clearLogs
  }));

  const toggleLogDetails = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const formatDetails = (details: any): string => {
    if (!details) return '';
    
    try {
      // Форматируем объект в читаемый вид
      const formatted: string[] = [];
      const MAX_BODY_LENGTH = 5000; // Максимальная длина тела для отображения
      
      if (details.method && details.url) {
        formatted.push(`Method: ${details.method}`);
        formatted.push(`URL: ${details.url}`);
      }
      
      if (details.status !== undefined) {
        formatted.push(`Status: ${details.status}${details.statusText ? ` ${details.statusText}` : ''}`);
      }
      
      if (details.error) {
        formatted.push(`Error: ${details.error}`);
      }
      
      if (details.duration !== undefined) {
        formatted.push(`Duration: ${details.duration}ms`);
      }
      
      if (details.headers && Object.keys(details.headers).length > 0) {
        formatted.push(`\nHeaders:\n${JSON.stringify(details.headers, null, 2)}`);
      }
      
      if (details.requestBody !== undefined) {
        let bodyStr = typeof details.requestBody === 'string' 
          ? details.requestBody 
          : JSON.stringify(details.requestBody, null, 2);
        
        if (bodyStr.length > MAX_BODY_LENGTH) {
          bodyStr = bodyStr.substring(0, MAX_BODY_LENGTH) + `\n... (truncated, ${bodyStr.length} chars total)`;
        }
        formatted.push(`\nRequest Body:\n${bodyStr}`);
      }
      
      if (details.responseBody !== undefined) {
        let bodyStr = typeof details.responseBody === 'string' 
          ? details.responseBody 
          : JSON.stringify(details.responseBody, null, 2);
        
        if (bodyStr.length > MAX_BODY_LENGTH) {
          bodyStr = bodyStr.substring(0, MAX_BODY_LENGTH) + `\n... (truncated, ${bodyStr.length} chars total)`;
        }
        formatted.push(`\nResponse Body:\n${bodyStr}`);
      }
      
      // Добавляем остальные поля
      const processedKeys = ['method', 'url', 'status', 'statusText', 'error', 'duration', 'headers', 'requestBody', 'responseBody'];
      const otherKeys = Object.keys(details).filter(key => !processedKeys.includes(key));
      
      if (otherKeys.length > 0) {
        formatted.push('\nAdditional Info:');
        otherKeys.forEach(key => {
          const value = typeof details[key] === 'object' 
            ? JSON.stringify(details[key], null, 2)
            : String(details[key]);
          formatted.push(`${key}: ${value}`);
        });
      }
      
      return formatted.join('\n');
    } catch (err) {
      return JSON.stringify(details, null, 2);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-300 font-mono text-sm">
      {showControls && (
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-white flex items-center gap-2">
              <span>📟</span> Live Server Logs
            </h2>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-xs text-slate-400">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={clearLogs}
              className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded border border-slate-700"
              title="Clear logs"
            >
              Clear
            </button>
            <button 
              onClick={() => setAutoScroll(!autoScroll)} 
              className={`px-3 py-1 text-xs rounded border border-slate-700 ${
                autoScroll 
                  ? 'bg-green-900/30 text-green-400 border-green-900' 
                  : 'bg-slate-800 text-slate-500'
              }`}
              title="Toggle auto-scroll"
            >
              {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll PAUSED'}
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-auto p-4 space-y-1">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic text-center mt-10">
            {isConnected ? 'Waiting for logs...' : 'Connecting...'}
          </div>
        ) : (
          logs.map((log) => {
            const isExpanded = expandedLogs.has(log.id);
            const hasDetails = log.details && Object.keys(log.details).length > 0;

            // Извлекаем контекстные префиксы [TAG] из сообщения
            // Например: "[PIPELINE] Step 1 started" -> badge=PIPELINE, rest="Step 1 started"
            const tagMatch = log.message.match(/^\[([A-Z0-9_\-]+)\]\s(.*)$/);
            const contextBadge = tagMatch ? tagMatch[1] : null;
            const displayMessage = tagMatch ? tagMatch[2] : log.message;
            
            return (
              <div key={log.id} className={`${log.source === 'UI' ? 'bg-slate-900/30' : ''} rounded`}>
                <div 
                  className={`flex gap-3 hover:bg-slate-900 p-1 rounded cursor-pointer transition-colors ${
                    hasDetails ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => hasDetails && toggleLogDetails(log.id)}
                  title={hasDetails ? 'Click to view details' : ''}
                >
                  <span className="text-slate-600 shrink-0 text-xs select-none w-20">
                    {log.timestamp.split('T')[1].split('.')[0]}
                  </span>
                  <span className={`shrink-0 font-bold w-12 text-xs ${
                    log.level === 'ERROR' ? 'text-red-500' : 
                    log.level === 'WARN' ? 'text-amber-500' : 'text-blue-500'
                  }`}>
                    [{log.level}]
                  </span>
                  {log.source === 'UI' && !contextBadge && (
                    <span className="shrink-0 text-xs text-cyan-400 font-semibold w-8">
                      [UI]
                    </span>
                  )}
                  {contextBadge && (
                    <span className={`shrink-0 text-xs font-semibold px-1 rounded ${
                      log.source === 'UI'
                        ? 'bg-cyan-900/40 text-cyan-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {contextBadge}
                    </span>
                  )}
                  <span className={`break-all whitespace-pre-wrap flex-1 ${
                    log.level === 'ERROR' ? 'text-red-300' : 
                    log.source === 'UI' ? 'text-cyan-200' : 'text-slate-300'
                  }`}>
                    {displayMessage}
                  </span>
                  {hasDetails && (
                    <span className="shrink-0 text-xs text-slate-500 ml-2">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  )}
                </div>
                {isExpanded && hasDetails && (
                  <div className="ml-8 mr-4 mb-2 mt-1 p-3 bg-slate-900/50 rounded border border-slate-700/50">
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all font-mono">
                      {formatDetails(log.details)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});

LogViewer.displayName = 'LogViewer';

export default LogViewer;