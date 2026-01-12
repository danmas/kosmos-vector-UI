import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Tag, ItemTagsResponse, TagsListResponse } from '../types';
import { apiClient } from '../services/apiClient';
import { useDataCache } from '../lib/context/DataCacheContext';

interface TagsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string;
}

const TagsDialog: React.FC<TagsDialogProps> = ({ isOpen, onClose, itemId }) => {
  const { currentContextCode } = useDataCache();
  const [itemTags, setItemTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTagCodes, setSelectedTagCodes] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagCode, setNewTagCode] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagDescription, setNewTagDescription] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

  // Position and Size state
  const [position, setPosition] = useState({ x: window.innerWidth - 530, y: 64 });
  const [size, setSize] = useState({ width: 512, height: 500 });

  // Refs for dragging/resizing
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const sizeStartRef = useRef({ width: 0, height: 0 });

  // Загрузка тегов при открытии
  useEffect(() => {
    if (isOpen && itemId && currentContextCode) {
      loadData();
    }
  }, [isOpen, itemId, currentContextCode]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Загружаем теги AI Item
      const itemTagsRes = await apiClient.getItemTags(itemId);
      if (itemTagsRes.success) {
        setItemTags(itemTagsRes.tags || []);
        setSelectedTagCodes(itemTagsRes.tags.map(t => t.code));
      }

      // Загружаем все доступные теги
      const allTagsRes = await apiClient.getTags();
      if (allTagsRes.success) {
        setAllTags(allTagsRes.tags || []);
      }
    } catch (err: any) {
      console.error('Failed to load tags:', err);
      setError(err.message || 'Ошибка загрузки тегов');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTag = (tagCode: string) => {
    setSelectedTagCodes(prev => {
      if (prev.includes(tagCode)) {
        return prev.filter(c => c !== tagCode);
      } else {
        return [...prev, tagCode];
      }
    });
  };

  const handleSave = async () => {
    if (!itemId || !currentContextCode) return;

    setLoading(true);
    setError(null);
    try {
      // Используем PUT для синхронизации (заменяет все теги)
      const res = await apiClient.syncItemTags(itemId, selectedTagCodes);
      if (res.success) {
        setItemTags(res.tags || []);
        // Обновляем список всех тегов на случай, если были созданы новые
        const allTagsRes = await apiClient.getTags();
        if (allTagsRes.success) {
          setAllTags(allTagsRes.tags || []);
        }
      }
    } catch (err: any) {
      console.error('Failed to save tags:', err);
      setError(err.message || 'Ошибка сохранения тегов');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagCode.trim() || !newTagName.trim()) {
      setError('Код и название тега обязательны');
      return;
    }

    setCreatingTag(true);
    setError(null);
    try {
      await apiClient.createTag({
        code: newTagCode.trim(),
        name: newTagName.trim(),
        description: newTagDescription.trim() || undefined,
      });

      // Обновляем список тегов
      const allTagsRes = await apiClient.getTags();
      if (allTagsRes.success) {
        setAllTags(allTagsRes.tags || []);
      }

      // Автоматически добавляем новый тег к выбранным
      setSelectedTagCodes(prev => [...prev, newTagCode.trim()]);

      // Очищаем форму
      setNewTagCode('');
      setNewTagName('');
      setNewTagDescription('');
      setShowCreateForm(false);
    } catch (err: any) {
      console.error('Failed to create tag:', err);
      setError(err.message || 'Ошибка создания тега');
    } finally {
      setCreatingTag(false);
    }
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
        width: Math.max(400, sizeStartRef.current.width + deltaX),
        height: Math.max(300, sizeStartRef.current.height + deltaY)
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

  // Сброс формы при закрытии
  useEffect(() => {
    if (!isOpen) {
      setShowCreateForm(false);
      setNewTagCode('');
      setNewTagName('');
      setNewTagDescription('');
      setError(null);
    }
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
        {/* Header - Drag Handle */}
        <div
          onMouseDown={onMouseDownDrag}
          className="px-3 py-2 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center cursor-move select-none"
        >
          <div className="flex items-center gap-2">
            <div className="bg-purple-500/20 p-1 rounded">
              <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide">Теги: {itemId}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {loading && !itemTags.length && !allTags.length ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
              Загрузка тегов...
            </div>
          ) : error && !itemTags.length ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 w-full max-w-sm">
                <div className="flex items-center gap-2 mb-2 text-red-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-bold text-sm">Ошибка</span>
                </div>
                <p className="text-xs text-red-200/80">{error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Текущие теги */}
              <div className="p-3 border-b border-slate-700 bg-slate-800/30 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-300">Назначенные теги</h3>
                  <span className="text-[10px] text-slate-500">{itemTags.length}</span>
                </div>
                {itemTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {itemTags.map(tag => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/50 rounded text-[10px] font-mono"
                        title={tag.description || undefined}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 italic">Теги отсутствуют</p>
                )}
              </div>

              {/* Список всех тегов для выбора */}
              <div className="flex-1 overflow-y-auto p-3 bg-slate-900/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-300">Доступные теги</h3>
                  <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Новый тег
                  </button>
                </div>

                {/* Форма создания тега */}
                {showCreateForm && (
                  <div className="mb-4 p-3 bg-slate-800/60 border border-slate-700 rounded">
                    <h4 className="text-[10px] font-bold text-slate-300 mb-2">Создать новый тег</h4>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Код тега (например: deprecated)"
                        value={newTagCode}
                        onChange={(e) => setNewTagCode(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-600 rounded py-1 px-2 text-[10px] text-white focus:border-blue-500 outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Название (например: Устаревший код)"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-600 rounded py-1 px-2 text-[10px] text-white focus:border-blue-500 outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Описание (необязательно)"
                        value={newTagDescription}
                        onChange={(e) => setNewTagDescription(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-600 rounded py-1 px-2 text-[10px] text-white focus:border-blue-500 outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleCreateTag}
                          disabled={creatingTag || !newTagCode.trim() || !newTagName.trim()}
                          className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-[10px] font-bold py-1 px-2 rounded transition-colors"
                        >
                          {creatingTag ? 'Создание...' : 'Создать'}
                        </button>
                        <button
                          onClick={() => {
                            setShowCreateForm(false);
                            setNewTagCode('');
                            setNewTagName('');
                            setNewTagDescription('');
                          }}
                          className="bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold py-1 px-2 rounded transition-colors"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Список тегов с чекбоксами */}
                {allTags.length > 0 ? (
                  <div className="space-y-1.5">
                    {allTags.map(tag => {
                      const isSelected = selectedTagCodes.includes(tag.code);
                      return (
                        <label
                          key={tag.id}
                          className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-purple-500/20 border-purple-500/50'
                              : 'bg-slate-800/40 border-slate-700 hover:bg-slate-800/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleTag(tag.code)}
                            className="mt-0.5 w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500 focus:ring-offset-slate-900"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-200">{tag.name}</span>
                              <span className="text-[9px] text-slate-500 font-mono">({tag.code})</span>
                            </div>
                            {tag.description && (
                              <p className="text-[9px] text-slate-400 mt-0.5">{tag.description}</p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 italic text-center py-4">
                    Теги отсутствуют. Создайте первый тег.
                  </p>
                )}

                {error && (
                  <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-[10px] text-red-400">
                    {error}
                  </div>
                )}
              </div>

              {/* Footer с кнопками */}
              <div className="p-3 border-t border-slate-700 bg-slate-800/50 flex justify-between items-center shrink-0">
                <div className="text-[9px] text-slate-600">
                  Выбрано: {selectedTagCodes.length}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-2.5 w-2.5 border-b border-white"></div>
                        Сохранение...
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Сохранить
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
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

export default TagsDialog;