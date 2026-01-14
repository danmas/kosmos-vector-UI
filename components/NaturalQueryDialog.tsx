import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NaturalQueryResponse, AgentScript, SuggestSuggestion } from '../types';
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

    // Suggestions state
    const [allScripts, setAllScripts] = useState<AgentScript[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredSuggestions, setFilteredSuggestions] = useState<AgentScript[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    
    // Similar questions state (серверный поиск)
    const [isSearchingSimilar, setIsSearchingSimilar] = useState(false);
    const [similarSuggestions, setSimilarSuggestions] = useState<SuggestSuggestion[]>([]);
    const [showSimilarResults, setShowSimilarResults] = useState(false);
    const [isEditingScript, setIsEditingScript] = useState(false);
    const [editedScriptCode, setEditedScriptCode] = useState('');
    const [isSavingScript, setIsSavingScript] = useState(false);
    const [isExecutingScript, setIsExecutingScript] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Position and Size state
    const [position, setPosition] = useState({ x: window.innerWidth - 530, y: 64 });
    const [size, setSize] = useState({ width: 512, height: 400 });

    // Refs for dragging/resizing
    const isDraggingRef = useRef(false);
    const isResizingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const sizeStartRef = useRef({ width: 0, height: 0 });
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Fetch scripts on open
    useEffect(() => {
        if (isOpen) {
            const fetchScripts = async () => {
                try {
                    const res = await apiClient.getAgentScripts(1, 100);
                    if (res.success) {
                        setAllScripts(res.scripts);
                    }
                } catch (err) {
                    console.error('Failed to fetch scripts:', err);
                }
            };
            fetchScripts();
        }
    }, [isOpen]);

    // Handle initial position on mount
    useEffect(() => {
        setPosition({ x: window.innerWidth - 530, y: 64 });
    }, []);

    // Filter suggestions based on input
    useEffect(() => {
        if (showSuggestions) {
            const lowQuestion = question.toLowerCase().trim();
            let filtered = allScripts;

            if (lowQuestion.length > 0) {
                filtered = allScripts.filter(s =>
                    s.question.toLowerCase().includes(lowQuestion)
                );
            }

            const unique = Array.from(new Map(filtered.map(item => [item.question.toLowerCase(), item])).values());
            setFilteredSuggestions(unique);
        } else {
            setFilteredSuggestions([]);
            setSelectedIndex(-1);
        }
    }, [question, allScripts, showSuggestions]);

    // Click outside suggestions to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
                setShowSimilarResults(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleQuery = async (queryToUse?: string) => {
        const finalQuestion = queryToUse || question;
        if (!finalQuestion.trim()) return;

        setQuestion(finalQuestion);
        setShowSuggestions(false);
        setIsLoading(true);
        setError(null);
        setIsEditingScript(false);
        try {
            const res = await apiClient.naturalQuery(finalQuestion);
            setResponse(res);

            if (res.scriptId) {
                const scriptRes = await apiClient.getAgentScript(res.scriptId);
                setScriptDetails(scriptRes.script);
            }
            setActiveTab('result');
        } catch (err: any) {
            console.error('Natural query error:', err);

            // Если у нас есть расширенные данные об ошибке от ApiError
            if (err.data && err.data.human) {
                setError(err.data.human);

                // Если в ошибке пришел скрипт, показываем его для отладки
                if (err.data.script) {
                    setScriptDetails({
                        id: err.data.scriptId || 0,
                        script: err.data.script,
                        context_code: '',
                        question: finalQuestion,
                        usage_count: 0,
                        is_valid: false,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    } as any);

                    // Также создаем "фейковый" ответ, чтобы показать вкладки
                    setResponse({
                        success: false,
                        human: err.data.human,
                        raw: err.data.last_result?.raw || null,
                        scriptId: err.data.scriptId,
                        cached: err.data.cached || false,
                        last_result: err.data.last_result
                    } as any);
                }
            } else {
                setError(err instanceof Error ? err.message : 'Unknown error occurred');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const selectSuggestion = async (suggestion: AgentScript) => {
        setQuestion(suggestion.question);
        setIsLoading(true);
        setError(null);
        setIsEditingScript(false);

        try {
            // Загружаем полные данные скрипта, включая возможный last_result
            const res = await apiClient.getAgentScript(suggestion.id);
            if (res.success) {
                const fullScript = res.script;
                setScriptDetails(fullScript);

                if (fullScript.last_result) {
                    setResponse({
                        success: true,
                        human: fullScript.last_result.human,
                        raw: fullScript.last_result.raw,
                        scriptId: fullScript.id,
                        cached: true,
                        last_result: fullScript.last_result
                    });
                    setActiveTab('result');
                } else {
                    // Если результатов еще нет, показываем готовность
                    setResponse(null);
                    setActiveTab('result');
                }
            }
        } catch (err) {
            console.error('Error fetching script details:', err);
            // Fallback на данные из списка
            setScriptDetails(suggestion);
            if (suggestion.last_result) {
                setResponse({
                    success: true,
                    human: suggestion.last_result.human,
                    raw: suggestion.last_result.raw,
                    scriptId: suggestion.id,
                    cached: true,
                    last_result: suggestion.last_result
                });
                setActiveTab('result');
            }
        } finally {
            setIsLoading(false);
            setShowSuggestions(false);
            setShowSimilarResults(false);
            setSelectedIndex(-1);
            inputRef.current?.focus();
        }
    };

    const handleSearchSimilar = async () => {
        if (!question.trim()) return;
        
        setIsSearchingSimilar(true);
        setShowSuggestions(false); // Скрыть обычный dropdown
        
        try {
            const res = await apiClient.suggestSimilarQuestions(question.trim());
            if (res.success && res.suggestions.length > 0) {
                // Сортировка по similarity desc (наиболее похожие выше)
                const sorted = [...res.suggestions].sort((a, b) => b.similarity - a.similarity);
                setSimilarSuggestions(sorted);
                setShowSimilarResults(true);
            } else {
                setSimilarSuggestions([]);
                setShowSimilarResults(true); // Показать "No similar questions found"
            }
        } catch (err) {
            console.error('Failed to search similar questions:', err);
            setSimilarSuggestions([]);
            setShowSimilarResults(true);
        } finally {
            setIsSearchingSimilar(false);
        }
    };

    const selectSimilarSuggestion = async (suggestion: SuggestSuggestion) => {
        setQuestion(suggestion.question);
        setShowSimilarResults(false);
        setSimilarSuggestions([]);
        setIsLoading(true);
        setError(null);

        try {
            const res = await apiClient.getAgentScript(suggestion.id);
            if (res.success) {
                const fullScript = res.script;
                setScriptDetails(fullScript);

                if (fullScript.last_result) {
                    setResponse({
                        success: true,
                        human: fullScript.last_result.human,
                        raw: fullScript.last_result.raw,
                        scriptId: fullScript.id,
                        cached: true,
                        last_result: fullScript.last_result
                    });
                    setActiveTab('result');
                } else {
                    setResponse(null);
                    setActiveTab('result');
                }
            }
        } catch (err) {
            console.error('Error fetching script details:', err);
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown' && !showSuggestions) {
            if (allScripts.length > 0) {
                setShowSuggestions(true);
                return;
            }
        }

        if (!showSuggestions || filteredSuggestions.length === 0) {
            if (e.key === 'Enter') {
                handleQuery();
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < filteredSuggestions.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            if (selectedIndex >= 0) {
                e.preventDefault();
                selectSuggestion(filteredSuggestions[selectedIndex]);
            } else {
                handleQuery();
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const applyToSearch = () => {
        console.log('[NaturalQueryDialog] applyToSearch called, response:', response);
        if (response?.raw) {
            let filterValue = '';
            if (Array.isArray(response.raw)) {
                if (response.raw.length === 0) {
                    console.warn('[NaturalQueryDialog] Raw result is an empty array, nothing to filter');
                    return;
                }

                console.log('[NaturalQueryDialog] Processing array raw data, length:', response.raw.length);
                // Извлекаем лучший идентификатор из каждого объекта
                const items = response.raw.map((item: any) => {
                    if (typeof item === 'string') return item;
                    // Список приоритетных ключей для имен/id
                    const idKeys = ['function_name', 'fullName', 'id', 'name', 'source', 'target', 'label'];
                    for (const key of idKeys) {
                        if (item[key]) return String(item[key]);
                    }
                    // Фоллбэк: берем первое строковое значение
                    const stringVal = Object.values(item).find(v => typeof v === 'string');
                    if (stringVal) return String(stringVal);

                    return JSON.stringify(item);
                });

                const uniqueItems = Array.from(new Set(items)).filter(Boolean);
                if (uniqueItems.length === 0) {
                    console.warn('[NaturalQueryDialog] No identifiers found in results');
                    return;
                }

                console.log('[NaturalQueryDialog] Unique items for regex:', uniqueItems);

                // Собираем регулярку, пока она влезает в разумный предел (например, 2000 символов)
                const MAX_REGEX_LENGTH = 2000;
                let includedItems: string[] = [];
                let currentLength = 10; // Длина обертки /^(?:)$/i

                for (const item of uniqueItems) {
                    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // Проверяем, влезет ли элемент (+1 для разделителя |)
                    if (currentLength + escaped.length + 1 < MAX_REGEX_LENGTH) {
                        includedItems.push(escaped);
                        currentLength += escaped.length + 1;
                    } else {
                        break;
                    }
                }

                if (includedItems.length < uniqueItems.length) {
                    console.warn(`[NaturalQueryDialog] Truncated regex to ${includedItems.length} items out of ${uniqueItems.length} due to length limits (${MAX_REGEX_LENGTH} chars)`);
                }

                // Создаем регулярку для точного совпадения через группу
                filterValue = `/^(?:${includedItems.join('|')})$/i`;
            } else if (typeof response.raw === 'string') {
                filterValue = response.raw;
            } else {
                filterValue = JSON.stringify(response.raw);
            }

            console.log('[NaturalQueryDialog] Applying filter value:', filterValue);
            onApplyResult(filterValue);
        } else {
            console.log('[NaturalQueryDialog] No raw data to apply');
        }
    };

    const copyScript = () => {
        if (scriptDetails?.script) {
            navigator.clipboard.writeText(scriptDetails.script);
        }
    };

    const handleSaveScript = async (runAfterSave = false) => {
        if (!scriptDetails || !editedScriptCode.trim()) return;

        setIsSavingScript(true);
        setSaveSuccess(false);
        try {
            const res = await apiClient.updateAgentScript(scriptDetails.id, {
                script: editedScriptCode
            });
            if (res.success) {
                setScriptDetails(res.script);
                setIsEditingScript(false);
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);

                if (runAfterSave) {
                    await handleRunScript();
                }
            }
        } catch (err: any) {
            console.error('Failed to save script:', err);
            setError(`Failed to save script: ${err.message}`);
        } finally {
            setIsSavingScript(false);
        }
    };

    const handleRunScript = async () => {
        if (!scriptDetails) return;

        setIsExecutingScript(true);
        setError(null);
        try {
            const res = await apiClient.executeAgentScript(scriptDetails.id);
            setResponse(res);
            setActiveTab('result');
        } catch (err: any) {
            console.error('Failed to execute script:', err);
            setError(`Execution failed: ${err.message}`);
            // Если ошибка содержит детали скрипта (NaturalQueryErrorResponse)
            if (err.data) {
                setResponse({
                    success: false,
                    human: err.data.human || err.message,
                    raw: err.data.last_result?.raw || null,
                    scriptId: err.data.scriptId || scriptDetails.id,
                    cached: false,
                    last_result: err.data.last_result || null
                });
            }
        } finally {
            setIsExecutingScript(false);
        }
    };

    const startEditing = () => {
        if (scriptDetails) {
            setEditedScriptCode(scriptDetails.script);
            setIsEditingScript(true);
        }
    };

    // Simple syntax highligher
    const renderHighlightedCode = (code: string) => {
        if (!code) return null;

        // Split by primary tokens: keywords, strings (incl. backticks), and comments
        const parts = code.split(/(\b(?:async|function|const|let|var|await|return|if|else|for|while|try|catch|finally)\b|\`[\s\S]*?\`|\".*?\"|\'.*?\'|\/\/.*)/g);

        return parts.map((part, i) => {
            if (!part) return null;

            // Keywords
            if (/^\b(async|function|const|let|var|await|return|if|else|for|while|try|catch|finally)\b$/.test(part)) {
                return <span key={i} className="text-purple-400 font-bold">{part}</span>;
            }
            // Template literals (SQL)
            if (part.startsWith('`')) {
                return <span key={i} className="text-emerald-400">{part}</span>;
            }
            // Strings
            if (part.startsWith('"') || part.startsWith("'")) {
                return <span key={i} className="text-amber-300">{part}</span>;
            }
            // Comments
            if (part.startsWith('//')) {
                return <span key={i} className="text-slate-500 italic">{part}</span>;
            }
            // Objects/Services
            const subparts = part.split(/(\b(?:DbService|ApiClient|JSON|Object|Array)\b)/g);
            return subparts.map((sub, j) => {
                if (/^(DbService|ApiClient|JSON|Object|Array)$/.test(sub)) {
                    return <span key={`${i}-${j}`} className="text-yellow-400">{sub}</span>;
                }
                return <span key={`${i}-${j}`} className="text-blue-200/80">{sub}</span>;
            });
        });
    };

    // Dragging logic
    const onMouseDownDrag = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
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
                        <h2 className="text-sm font-bold text-white tracking-wide text-shadow-sm">Natural Query</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Query Input Area */}
                <div className="p-3 bg-slate-800/30 border-b border-slate-700 shrink-0 relative z-20">
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <input
                                ref={inputRef}
                                type="text"
                                value={question}
                                onFocus={() => {
                                    setShowSuggestions(true);
                                    setShowSimilarResults(false);
                                }}
                                onChange={(e) => {
                                    setQuestion(e.target.value);
                                    setShowSuggestions(true);
                                    setShowSimilarResults(false);
                                }}
                                onKeyDown={onKeyDown}
                                placeholder="Ask about the codebase..."
                                className="w-full bg-slate-950 border border-slate-600 rounded py-1.5 px-3 text-xs text-white focus:border-blue-500 outline-none transition-all placeholder:text-slate-600 shadow-inner"
                            />
                            {isLoading && (
                                <div className="absolute right-2 top-1.5">
                                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b border-blue-500"></div>
                                </div>
                            )}

                            {/* Existing Suggestions Dropdown (клиентская фильтрация) */}
                            {showSuggestions && !showSimilarResults && filteredSuggestions.length > 0 && (
                                <div
                                    ref={suggestionsRef}
                                    className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-xl overflow-hidden z-30 max-h-48 overflow-y-auto animate-in fade-in zoom-in duration-200"
                                >
                                    {filteredSuggestions.map((suggestion, index) => (
                                        <button
                                            key={suggestion.id}
                                            onClick={() => selectSuggestion(suggestion)}
                                            className={`w-full text-left px-3 py-2 text-[10px] transition-colors border-b border-slate-700 last:border-0 ${selectedIndex === index
                                                ? 'bg-blue-600 text-white'
                                                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                                                }`}
                                        >
                                            {suggestion.question}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Similar Questions Dropdown (серверный поиск) */}
                            {showSimilarResults && (
                                <div
                                    ref={suggestionsRef}
                                    className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-xl overflow-hidden z-30 max-h-48 overflow-y-auto animate-in fade-in zoom-in duration-200"
                                >
                                    {similarSuggestions.length > 0 ? (
                                        similarSuggestions.map((suggestion) => (
                                            <button
                                                key={suggestion.id}
                                                onClick={() => selectSimilarSuggestion(suggestion)}
                                                className="w-full text-left px-3 py-2 text-[10px] transition-colors border-b border-slate-700 last:border-0 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-between gap-2"
                                            >
                                                <span className="truncate flex-1">{suggestion.question}</span>
                                                <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                                    suggestion.similarity >= 0.95 
                                                        ? 'bg-green-500/20 text-green-400' 
                                                        : suggestion.similarity >= 0.9 
                                                            ? 'bg-blue-500/20 text-blue-400' 
                                                            : 'bg-slate-600/50 text-slate-400'
                                                }`}>
                                                    {Math.round(suggestion.similarity * 100)}%
                                                </span>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="px-3 py-2 text-[10px] text-slate-500 text-center">
                                            No similar questions found
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        {/* Кнопка поиска похожих */}
                        <button
                            onClick={handleSearchSimilar}
                            disabled={isSearchingSimilar || !question.trim()}
                            title="Find similar questions"
                            className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-300 hover:text-white p-1.5 rounded transition-all shadow-md active:scale-95 border border-slate-600 disabled:border-slate-700"
                        >
                            {isSearchingSimilar ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b border-slate-400"></div>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            )}
                        </button>
                        
                        {/* Run button */}
                        <button
                            onClick={() => handleQuery()}
                            disabled={isLoading || !question.trim()}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-[10px] font-bold py-1.5 px-3 rounded transition-all shadow-md active:scale-95 flex items-center gap-1 active:bg-blue-700"
                        >
                            <span>Run</span>
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-h-0 relative z-10">
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
                            <div className="flex-1 overflow-y-auto p-3 bg-slate-900/50 scrollbar-thin scrollbar-thumb-slate-700">
                                {activeTab === 'result' && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                        <div className="bg-slate-800/60 border border-slate-700 rounded p-3 shadow-inner">
                                            <p className="text-slate-300 text-xs leading-relaxed">
                                                {response.human}
                                            </p>
                                        </div>

                                        {response.cached && (
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5 text-green-400/70 text-[9px] font-bold uppercase tracking-tight">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></span>
                                                    Cached
                                                </div>
                                                {response.last_result?.executed_at && (
                                                    <div className="text-[8px] text-slate-500 mt-0.5 flex items-center gap-1">
                                                        <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        {new Date(response.last_result.executed_at).toLocaleString()}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'script' && (
                                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200 h-full flex flex-col gap-2">
                                        {scriptDetails ? (
                                            <div className="flex-1 flex flex-col bg-slate-950 rounded border border-slate-700 overflow-hidden shadow-inner">
                                                <div className="bg-slate-800/80 px-2 py-1 border-b border-slate-700 flex justify-between items-center shrink-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-mono text-slate-500">ID: {scriptDetails.id}</span>
                                                        <span className="text-[8px] bg-blue-500/10 text-blue-400 px-1 py-0.5 rounded border border-blue-500/20 font-bold">JS</span>
                                                        {saveSuccess && (
                                                            <span className="text-[8px] text-green-400 font-bold animate-pulse">✓ Saved</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {!isEditingScript ? (
                                                            <>
                                                                <button
                                                                    onClick={handleRunScript}
                                                                    disabled={isExecutingScript}
                                                                    className="text-[9px] text-green-400 hover:text-white flex items-center gap-1 bg-green-500/10 hover:bg-green-500/20 px-1.5 py-0.5 rounded transition-colors border border-green-500/30 disabled:opacity-50"
                                                                >
                                                                    {isExecutingScript ? (
                                                                        <div className="animate-spin rounded-full h-2 w-2 border-b border-green-400"></div>
                                                                    ) : (
                                                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                        </svg>
                                                                    )}
                                                                    Run
                                                                </button>
                                                                <button
                                                                    onClick={startEditing}
                                                                    className="text-[9px] text-blue-400 hover:text-white flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 px-1.5 py-0.5 rounded transition-colors border border-blue-500/30"
                                                                >
                                                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M15.586 15.586a2 2 0 112.828 2.828l-6.414 6.414-2.828.707.707-2.828 6.414-6.414zm.707-3.536L12.757 14.8l-1.414-1.414 3.536-3.536 1.414 1.414zm-4.242 4.242l-1.414-1.414 3.536-3.536 1.414 1.414-3.536 3.536z" />
                                                                    </svg>
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={copyScript}
                                                                    className="text-[9px] text-slate-400 hover:text-white flex items-center gap-1 bg-slate-700/50 px-1.5 py-0.5 rounded transition-colors border border-slate-600"
                                                                >
                                                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                                                    </svg>
                                                                    Copy
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => handleSaveScript(true)}
                                                                    disabled={isSavingScript || isExecutingScript}
                                                                    className="text-[9px] text-blue-400 hover:text-white flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 px-1.5 py-0.5 rounded transition-colors border border-blue-500/30 disabled:opacity-50"
                                                                >
                                                                    {(isSavingScript || isExecutingScript) ? (
                                                                        <div className="animate-spin rounded-full h-2 w-2 border-b border-blue-400"></div>
                                                                    ) : (
                                                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                                        </svg>
                                                                    )}
                                                                    Save & Run
                                                                </button>
                                                                <button
                                                                    onClick={() => handleSaveScript(false)}
                                                                    disabled={isSavingScript || isExecutingScript}
                                                                    className="text-[9px] text-green-400 hover:text-white flex items-center gap-1 bg-green-500/10 hover:bg-green-500/20 px-1.5 py-0.5 rounded transition-colors border border-green-500/30 disabled:opacity-50"
                                                                >
                                                                    {isSavingScript ? (
                                                                        <div className="animate-spin rounded-full h-2 w-2 border-b border-green-400"></div>
                                                                    ) : (
                                                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    )}
                                                                    Save
                                                                </button>
                                                                <button
                                                                    onClick={() => setIsEditingScript(false)}
                                                                    disabled={isSavingScript}
                                                                    className="text-[9px] text-red-400 hover:text-white flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 px-1.5 py-0.5 rounded transition-colors border border-red-500/30 disabled:opacity-50"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                {isEditingScript ? (
                                                    <textarea
                                                        value={editedScriptCode}
                                                        onChange={(e) => setEditedScriptCode(e.target.value)}
                                                        className="flex-1 bg-slate-950 p-3 text-[10px] font-mono leading-relaxed text-blue-300 outline-none resize-none scrollbar-thin scrollbar-thumb-slate-700"
                                                        spellCheck={false}
                                                    />
                                                ) : (
                                                    <pre className="flex-1 overflow-auto p-3 text-[10px] font-mono leading-relaxed selection:bg-blue-500/30 whitespace-pre-wrap break-all">
                                                        <code>{renderHighlightedCode(scriptDetails.script)}</code>
                                                    </pre>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-500 text-[10px]">
                                                Loading script...
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'raw' && (
                                    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200 h-full flex flex-col gap-3">
                                        <div className="flex-1 bg-slate-950 rounded border border-slate-700 overflow-hidden shadow-inner">
                                            <pre className="h-full overflow-auto p-2.5 text-[10px] font-mono text-slate-400 selection:bg-blue-500/30">
                                                <code>{JSON.stringify(response.raw, null, 2)}</code>
                                            </pre>
                                        </div>
                                        <div className="flex justify-end">
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
                            </div>
                        </>
                    ) : error ? (
                        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center">
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 w-full max-w-sm">
                                <div className="flex items-center gap-2 mb-2 text-red-400">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="font-bold text-sm">Ошибка запроса</span>
                                </div>
                                <p className="text-xs text-red-200/80 leading-relaxed mb-4">
                                    {error}
                                </p>
                                {scriptDetails && (
                                    <button
                                        onClick={() => setActiveTab('script')}
                                        className="text-[10px] text-blue-400 hover:text-blue-300 underline font-bold"
                                    >
                                        Посмотреть код скрипта для отладки
                                    </button>
                                )}
                            </div>
                        </div>
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
