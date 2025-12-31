import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NaturalQueryResponse, AgentScript } from '../types';
import { apiClient } from '../services/apiClient';

interface NaturalQueryDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onApplyResult: (result: string) => void;
}

const NaturalQueryDialog: React.FC<NaturalQueryDialogProps> = ({ isOpen, onClose, onApplyResult }) => {
    const [question, setQuestion] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'result' | 'script' | 'raw'>('result');
    const [response, setResponse] = useState<NaturalQueryResponse | null>(null);
    const [scriptDetails, setScriptDetails] = useState<AgentScript | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Position and Size state
    const [position, setPosition] = useState({ x: window.innerWidth - 530, y: 64 });
    const [size, setSize] = useState({ width: 512, height: 400 });

    // Refs for dragging/resizing
    const isDraggingRef = useRef(false);
    const isResizingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const sizeStartRef = useRef({ width: 0, height: 0 });

    const handleQuery = async () => {
        if (!question.trim()) return;

        setIsLoading(true);
        setError(null);
        try {
            const res = await apiClient.naturalQuery(question);
            setResponse(res);

            if (res.scriptId) {
                const scriptRes = await apiClient.getAgentScript(res.scriptId);
                setScriptDetails(scriptRes.script);
            }
            setActiveTab('result');
        } catch (err) {
            console.error('Natural query error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const applyToSearch = () => {
        if (response?.raw) {
            let filterValue = '';
            if (Array.isArray(response.raw)) {
                filterValue = response.raw.map((item: any) => item.id || item.name || item.source || item.target || JSON.stringify(item)).join('|');
                if (filterValue.length > 200) {
                    filterValue = filterValue.substring(0, 200) + '...';
                }
            } else if (typeof response.raw === 'string') {
                filterValue = response.raw;
            } else {
                filterValue = JSON.stringify(response.raw);
            }

            onApplyResult(filterValue);
            onClose();
        }
    };

    // Dragging logic
    const onMouseDownDrag = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return; // Don't drag if clicking buttons
        isDraggingRef.current = true;
        dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
        e.preventDefault();
    };

    // Resizing logic
    const onMouseDownResize = (e: React.MouseEvent) => {
        isResizingRef.current = true;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        sizeStartRef.current = { width: size.width, height: size.height };
        e.preventDefault();
        e.stopPropagation();
    };

    const onGlobalMouseMove = useCallback((e: MouseEvent) => {
        if (isDraggingRef.current) {
            setPosition({
                x: e.clientX - dragStartRef.current.x,
                y: e.clientY - dragStartRef.current.y
            });
        } else if (isResizingRef.current) {
            const deltaX = e.clientX - dragStartRef.current.x;
            const deltaY = e.clientY - dragStartRef.current.y;
            setSize({
                width: Math.max(300, sizeStartRef.current.width + deltaX),
                height: Math.max(200, sizeStartRef.current.height + deltaY)
            });
        }
    }, [position, size]);

    const onGlobalMouseUp = useCallback(() => {
        isDraggingRef.current = false;
        isResizingRef.current = false;
    }, []);

    useEffect(() => {
        if (isOpen) {
            window.addEventListener('mousemove', onGlobalMouseMove);
            window.addEventListener('mouseup', onGlobalMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', onGlobalMouseMove);
            window.removeEventListener('mouseup', onGlobalMouseUp);
        };
    }, [isOpen, onGlobalMouseMove, onGlobalMouseUp]);

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
                {/* Header - Drag Handle */}
                <div
                    onMouseDown={onMouseDownDrag}
                    className="px-3 py-2 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center cursor-move select-none"
                >
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-500/20 p-1 rounded">
                            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                        </div>
                        <h2 className="text-sm font-bold text-white tracking-wide">Natural Query</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Query Input Area */}
                <div className="p-3 bg-slate-800/30 border-b border-slate-700 shrink-0">
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                                placeholder="Ask about the codebase..."
                                className="w-full bg-slate-950 border border-slate-600 rounded py-1.5 px-3 text-xs text-white focus:border-blue-500 outline-none transition-all placeholder:text-slate-600 shadow-inner"
                            />
                            {isLoading && (
                                <div className="absolute right-2 top-1.5">
                                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-blue-500"></div>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleQuery}
                            disabled={isLoading || !question.trim()}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-[10px] font-bold py-1.5 px-3 rounded transition-all shadow-md active:scale-95 flex items-center gap-1"
                        >
                            <span>Run</span>
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-h-0">
                    {response ? (
                        <>
                            {/* Tabs */}
                            <div className="flex border-b border-slate-700 bg-slate-800/50 shrink-0">
                                {(['result', 'script', 'raw'] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-4 py-1.5 text-[10px] font-bold transition-all border-b-2 capitalize shadow-sm ${activeTab === tab
                                                ? 'text-blue-400 border-blue-400 bg-blue-900/10'
                                                : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-700/30'
                                            }`}
                                    >
                                        {tab === 'result' ? 'Interpretation' : tab === 'script' ? 'Agent Script' : 'Raw Data'}
                                    </button>
                                ))}
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 overflow-y-auto p-3 bg-slate-900/50">
                                {activeTab === 'result' && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                        <div className="bg-slate-800/60 border border-slate-700 rounded p-3 shadow-inner">
                                            <p className="text-slate-300 text-xs leading-relaxed">
                                                {response.human}
                                            </p>
                                        </div>

                                        <div className="flex justify-between items-center">
                                            {response.cached ? (
                                                <div className="flex items-center gap-1.5 text-green-400/70 text-[9px] font-bold uppercase tracking-tight">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
                                                    Cached
                                                </div>
                                            ) : <div />}

                                            <button
                                                onClick={applyToSearch}
                                                className="bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1 rounded text-[10px] font-bold transition-all shadow-sm active:scale-95 border border-slate-600 flex items-center gap-1.5"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 8.293A1 1 0 013 7.586V4z" />
                                                </svg>
                                                Apply to Filter
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'script' && (
                                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200 h-full flex flex-col gap-2">
                                        {scriptDetails ? (
                                            <div className="flex-1 flex flex-col bg-slate-950 rounded border border-slate-700 overflow-hidden">
                                                <div className="bg-slate-800 px-2 py-1 border-b border-slate-700 flex justify-between items-center shrink-0">
                                                    <span className="text-[9px] font-mono text-slate-500">script_id: {scriptDetails.id}</span>
                                                    <span className="text-[8px] bg-blue-500/10 text-blue-400 px-1 py-0.5 rounded border border-blue-500/20 font-bold uppercase">JS</span>
                                                </div>
                                                <pre className="flex-1 overflow-auto p-2.5 text-[10px] font-mono text-blue-300/80 leading-normal selection:bg-blue-500/30">
                                                    <code>{scriptDetails.script}</code>
                                                </pre>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-500 text-[10px]">
                                                Loading script...
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'raw' && (
                                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200 h-full flex flex-col">
                                        <div className="flex-1 bg-slate-950 rounded border border-slate-700 overflow-hidden">
                                            <pre className="h-full overflow-auto p-2.5 text-[10px] font-mono text-slate-400 selection:bg-blue-500/30">
                                                <code>{JSON.stringify(response.raw, null, 2)}</code>
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-slate-900/20">
                            <div className="bg-slate-800/40 p-4 rounded-full mb-3 border border-slate-700/30">
                                <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                            </div>
                            <p className="text-xs font-bold text-slate-400">Natural Query Engine</p>
                            <p className="text-[9px] text-slate-500 mt-1 max-w-[200px] text-center px-4">
                                Enter your question to generate logic scripts.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-3 py-1 border-t border-slate-700 bg-slate-800/50 flex justify-between items-center shrink-0">
                    <div className="text-[9px] text-slate-600">
                        AI Active
                    </div>
                </div>

                {/* Resize Handle */}
                <div
                    onMouseDown={onMouseDownResize}
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-[101] flex items-end justify-end p-0.5"
                >
                    <svg className="w-2 h-2 text-slate-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22 22h-2v-2h2v2zM22 18h-2v-2h2v2zM18 22h-2v-2h2v2zM18 18h-2v-2h2v2zM14 22h-2v-2h2v2zM22 14h-2v-2h2v2z" />
                    </svg>
                </div>
            </div>
        </div>
    );
};

export default NaturalQueryDialog;
