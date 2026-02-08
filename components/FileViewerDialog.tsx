import React, { useState, useEffect, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useDataCache } from '../lib/context/DataCacheContext';

interface FileViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  fileName: string;
}

const FileViewerDialog: React.FC<FileViewerDialogProps> = ({ isOpen, onClose, filePath, fileName }) => {
  const { currentContextCode } = useDataCache();
  
  // Dialog position and size
  const [position, setPosition] = useState({ x: 150, y: 150 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);

  // File content state
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Определяем язык для подсветки синтаксиса по расширению
  const getLanguageFromExtension = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'py': 'python',
      'go': 'go',
      'java': 'java',
      'md': 'markdown',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'txt': 'text',
      'env': 'bash',
    };
    
    return languageMap[ext] || 'text';
  };

  const language = getLanguageFromExtension(fileName);

  // Загрузка содержимого файла
  useEffect(() => {
    if (!isOpen) return;

    const loadFileContent = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log('[FileViewerDialog] Loading file:', filePath);
        
        // Передаем абсолютный путь с context-code
        const contextCode = currentContextCode || 'KOSMOS-VECTOR';
        const url = `/api/file-content?context-code=${encodeURIComponent(contextCode)}&path=${encodeURIComponent(filePath)}`;
        console.log('[FileViewerDialog] Request URL:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`Ошибка загрузки файла: ${response.statusText}`);
        }
        
        const text = await response.text();
        setContent(text);
      } catch (err) {
        console.error('[FileViewerDialog] Error loading file:', err);
        setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      } finally {
        setLoading(false);
      }
    };

    loadFileContent();
  }, [isOpen, filePath, currentContextCode]);

  // Reset position when opening
  useEffect(() => {
    if (isOpen) {
      // Центрируем окно при открытии
      const centerX = (window.innerWidth - size.width) / 2;
      const centerY = (window.innerHeight - size.height) / 2;
      setPosition({ x: Math.max(50, centerX), y: Math.max(50, centerY) });
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

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

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
        className="drag-handle flex items-center justify-between px-2 py-1.5 border-b border-slate-700 bg-slate-800/80 shrink-0 cursor-move"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
          <span className="text-white font-bold text-xs">{fileName}</span>
          <span className="text-slate-500 text-[10px] font-mono">{language}</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-1 min-h-0 bg-slate-900">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-slate-400">
              <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Загрузка...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-2">
            <div className="bg-red-900/20 border border-red-700/30 rounded px-2 py-1.5">
              <div className="text-xs text-red-400 font-bold mb-0.5">Ошибка</div>
              <div className="text-[11px] text-red-300 font-mono">{error}</div>
            </div>
          </div>
        )}

        {!loading && !error && content && (
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            showLineNumbers={true}
            wrapLines={true}
            customStyle={{
              margin: 0,
              padding: '8px',
              fontSize: '11px',
              lineHeight: '1.4',
              background: 'transparent',
            }}
            lineNumberStyle={{
              minWidth: '3em',
              paddingRight: '1em',
              color: '#4b5563',
              userSelect: 'none',
            }}
          >
            {content}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
};

export default FileViewerDialog;
