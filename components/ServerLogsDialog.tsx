import React, { useState, useRef, useEffect } from 'react';
import LogViewer from './LogViewer';

interface ServerLogsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const STORAGE_KEY = 'serverLogsDialog_state';

const ServerLogsDialog: React.FC<ServerLogsDialogProps> = ({ isOpen, onClose }) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

  // Load saved state from localStorage
  const loadSavedState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Validate and adjust saved state to fit current viewport
        const savedWidth = Math.min(Math.max(state.width || 0, 400), viewportWidth - 20);
        const savedHeight = Math.min(Math.max(state.height || 0, 300), viewportHeight - 20);
        const savedX = Math.max(0, Math.min(state.x || 0, viewportWidth - savedWidth));
        const savedY = Math.max(0, Math.min(state.y || 0, viewportHeight - savedHeight));
        
        return {
          width: savedWidth,
          height: savedHeight,
          x: savedX,
          y: savedY
        };
      }
    } catch (e) {
      console.error('Failed to load saved dialog state:', e);
    }
    return null;
  };

  // Save state to localStorage
  const saveState = (newSize: { width: number; height: number }, newPosition: { x: number; y: number }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        width: newSize.width,
        height: newSize.height,
        x: newPosition.x,
        y: newPosition.y
      }));
    } catch (e) {
      console.error('Failed to save dialog state:', e);
    }
  };

  // Initialize size and position when dialog opens
  useEffect(() => {
    if (isOpen) {
      const savedState = loadSavedState();
      
      if (savedState) {
        setSize({ width: savedState.width, height: savedState.height });
        setPosition({ x: savedState.x, y: savedState.y });
      } else {
        // Default centered position
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const initialWidth = viewportWidth * 0.9;
        const initialHeight = viewportHeight * 0.85;
        setSize({ width: initialWidth, height: initialHeight });
        setPosition({ 
          x: (viewportWidth - initialWidth) / 2, 
          y: (viewportHeight - initialHeight) / 2 
        });
      }
    }
  }, [isOpen]);

  const handleResizeMouseDown = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDirection(direction);
    
    if (dialogRef.current) {
      const rect = dialogRef.current.getBoundingClientRect();
      startPosRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height,
        posX: position.x,
        posY: position.y
      };
    }
  };

  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    
    if (dialogRef.current) {
      const rect = dialogRef.current.getBoundingClientRect();
      startPosRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height,
        posX: position.x,
        posY: position.y
      };
    }
  };

  // Handle resizing
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newWidth = startPosRef.current.width;
      let newHeight = startPosRef.current.height;
      let newX = startPosRef.current.posX;
      let newY = startPosRef.current.posY;

      // Handle resize based on direction
      if (resizeDirection?.includes('right')) {
        newWidth = Math.min(Math.max(startPosRef.current.width + deltaX, 400), viewportWidth - 20);
      }
      if (resizeDirection?.includes('left')) {
        const newWidthValue = Math.min(Math.max(startPosRef.current.width - deltaX, 400), viewportWidth - 20);
        const deltaWidth = startPosRef.current.width - newWidthValue;
        newWidth = newWidthValue;
        newX = startPosRef.current.posX + deltaWidth;
      }
      if (resizeDirection?.includes('bottom')) {
        newHeight = Math.min(Math.max(startPosRef.current.height + deltaY, 300), viewportHeight - 20);
      }
      if (resizeDirection?.includes('top')) {
        const newHeightValue = Math.min(Math.max(startPosRef.current.height - deltaY, 300), viewportHeight - 20);
        const deltaHeight = startPosRef.current.height - newHeightValue;
        newHeight = newHeightValue;
        newY = startPosRef.current.posY + deltaHeight;
      }

      const newSize = { width: newWidth, height: newHeight };
      const newPosition = { x: newX, y: newY };
      setSize(newSize);
      setPosition(newPosition);
      saveState(newSize, newPosition);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDirection(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeDirection]);

  // Handle dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = startPosRef.current.posX + deltaX;
      let newY = startPosRef.current.posY + deltaY;

      // Keep dialog within viewport bounds
      newX = Math.max(0, Math.min(newX, viewportWidth - startPosRef.current.width));
      newY = Math.max(0, Math.min(newY, viewportHeight - startPosRef.current.height));

      const newPosition = { x: newX, y: newY };
      const currentSize = { width: startPosRef.current.width, height: startPosRef.current.height };
      setPosition(newPosition);
      saveState(currentSize, newPosition);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 pointer-events-none"
    >
      <div 
        ref={dialogRef}
        className="bg-slate-950 rounded-lg shadow-2xl border border-slate-800 flex flex-col overflow-hidden relative pointer-events-auto"
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
          minWidth: '400px',
          minHeight: '300px'
        }}
      >
        {/* Header - draggable */}
        <div 
          className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900 cursor-move select-none"
          onMouseDown={handleDragMouseDown}
        >
          <h2 className="font-bold text-white flex items-center gap-2 text-lg">
            <span>📟</span> Server Logs (Real-time)
          </h2>
          <div className="flex gap-2" onMouseDown={(e) => e.stopPropagation()}>
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
            <button 
              onClick={onClose}
              className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 text-slate-300"
              title="Close dialog"
            >
              ✕ Close
            </button>
          </div>
        </div>
        
        {/* LogViewer content */}
        <div className="flex-1 overflow-hidden">
          <LogViewer 
            autoScroll={autoScroll}
            onAutoScrollChange={setAutoScroll}
            showControls={false}
          />
        </div>

        {/* Resize handles */}
        {/* Resize handles */}
        {/* Top */}
        <div
          className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-blue-500/20 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'top')}
        />
        {/* Bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-blue-500/20 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')}
        />
        {/* Left */}
        <div
          className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize hover:bg-blue-500/20 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
        />
        {/* Right */}
        <div
          className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-blue-500/20 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
        />
        {/* Top-left */}
        <div
          className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize hover:bg-blue-500/30 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'top-left')}
        />
        {/* Top-right */}
        <div
          className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize hover:bg-blue-500/30 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'top-right')}
        />
        {/* Bottom-left */}
        <div
          className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize hover:bg-blue-500/30 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'bottom-left')}
        />
        {/* Bottom-right */}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-blue-500/30 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'bottom-right')}
        />
      </div>
    </div>
  );
};

export default ServerLogsDialog;

