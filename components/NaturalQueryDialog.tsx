import React, { useState, useEffect } from 'react';
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

    const handleQuery = async () => {
        if (!question.trim()) return;

        setIsLoading(true);
        setError(null);
        try {
            const res = await apiClient.naturalQuery(question);
            setResponse(res);

            // Fetch script details
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
            // Если raw это массив объектов с полем id или name, или просто строка
            // В зависимости от того, как настроен бэкенд natural-query
            // Обычно мы хотим передать строку для фильтрации в поиске
            let filterValue = '';
            if (Array.isArray(response.raw)) {
                // Если это список узлов, возьмем их ID
                filterValue = response.raw.map((item: any) => item.id || item.name || item.source || item.target || JSON.stringify(item)).join('|');
                // Ограничим длину для поиска
                if (filterValue.length > 200) {
                    filterValue = filterValue.substring(0, 200) + '...';
                    console.warn('Filter value truncated for search bar');
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-4 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-white">Natural Query Engine</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Query Input Area */}
                <div className="p-6 bg-slate-800/50 border-b border-slate-700">
                    <div className="flex gap-3">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                                placeholder="Ask a question about the codebase (e.g. 'Show functions called by api_auct')"
                                className="w-full bg-slate-950 border border-slate-600 rounded-lg py-3 px-4 text-white focus:border-blue-500 outline-none transition-all placeholder:text-slate-500 shadow-inner"
                            />
                            {isLoading && (
                                <div className="absolute right-3 top-3">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleQuery}
                            disabled={isLoading || !question.trim()}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 px-8 rounded-lg transition-all shadow-lg active:scale-95 flex items-center gap-2"
                        >
                            <span>Execute</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                        </button>
                    </div>
                    {error && (
                        <div className="mt-3 text-red-400 text-sm flex items-center gap-2 bg-red-900/20 p-2 rounded border border-red-900/30">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-h-0">
                    {response ? (
                        <>
                            {/* Tabs */}
                            <div className="flex border-b border-slate-700 bg-slate-800/80 sticky top-0 z-10">
                                <button
                                    onClick={() => setActiveTab('result')}
                                    className={`px-6 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'result' ? 'text-blue-400 border-blue-400 bg-blue-900/10' : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-700/50'
                                        }`}
                                >
                                    Interpretation
                                </button>
                                <button
                                    onClick={() => setActiveTab('script')}
                                    className={`px-6 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'script' ? 'text-blue-400 border-blue-400 bg-blue-900/10' : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-700/50'
                                        }`}
                                >
                                    Agent Script
                                </button>
                                <button
                                    onClick={() => setActiveTab('raw')}
                                    className={`px-6 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'raw' ? 'text-blue-400 border-blue-400 bg-blue-900/10' : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-700/50'
                                        }`}
                                >
                                    Raw Data
                                </button>
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 overflow-y-auto p-6 bg-slate-900/50">
                                {activeTab === 'result' && (
                                    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                                        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 shadow-lg">
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Response</h3>
                                            <p className="text-slate-200 text-lg leading-relaxed">
                                                {response.human}
                                            </p>
                                        </div>

                                        {response.cached && (
                                            <div className="flex items-center gap-2 text-green-400/80 text-xs font-medium bg-green-900/10 border border-green-900/30 w-fit px-3 py-1 rounded-full">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                                                Result from cache
                                            </div>
                                        )}

                                        <div className="flex justify-end pt-4">
                                            <button
                                                onClick={applyToSearch}
                                                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-md active:scale-95 border border-slate-600 flex items-center gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 8.293A1 1 0 013 7.586V4z" />
                                                </svg>
                                                Apply to Graph Filter
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'script' && (
                                    <div className="animate-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
                                        {scriptDetails ? (
                                            <div className="flex-1 flex flex-col bg-slate-950 rounded-xl border border-slate-700 shadow-2xl overflow-hidden">
                                                <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center shrink-0">
                                                    <span className="text-xs font-mono text-slate-400">agent_script_id: {scriptDetails.id}</span>
                                                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 font-bold uppercase">JavaScript</span>
                                                </div>
                                                <pre className="flex-1 overflow-auto p-4 text-sm font-mono text-blue-300/90 leading-relaxed selection:bg-blue-500/30">
                                                    <code>{scriptDetails.script}</code>
                                                </pre>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-500">
                                                Loading script details...
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'raw' && (
                                    <div className="animate-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
                                        <div className="flex-1 bg-slate-950 rounded-xl border border-slate-700 shadow-2xl overflow-hidden">
                                            <pre className="h-full overflow-auto p-4 text-sm font-mono text-slate-300 selection:bg-blue-500/30">
                                                <code>{JSON.stringify(response.raw, null, 2)}</code>
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-slate-900/30">
                            <div className="bg-slate-800/50 p-6 rounded-full mb-4 shadow-xl border border-slate-700/50">
                                <svg className="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                            </div>
                            <p className="text-lg font-medium text-slate-400">Enter your question above and click Execute</p>
                            <p className="text-sm text-slate-500 mt-2 max-w-md text-center">
                                I'll generate a custom analysis script, run it against the codebase database, and explain the results.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-700 bg-slate-800/80 flex justify-between items-center shrink-0">
                    <div className="text-[10px] text-slate-500 flex items-center gap-4">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> AI Engine Active</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Server: 3200</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-300 hover:text-white px-4 py-2 text-sm font-medium transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NaturalQueryDialog;
