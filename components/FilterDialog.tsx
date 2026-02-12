import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AiItemType, Tag } from '../types';
import { apiClient } from '../services/apiClient';
import { useDataCache } from '../lib/context/DataCacheContext';
import { useGraphFilter } from '../lib/context/GraphFilterContext';

// Feature toggle: использовать API для загрузки типов
const USE_TYPES_API = true; // Включаем сразу, т.к. бэкенд готов

interface FilterDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// Все возможные типы AI Items (legacy fallback)
const ALL_TYPES: { value: string; label: string; icon: string }[] = [
  { value: AiItemType.FUNCTION, label: 'Функции', icon: 'ƒ' },
  { value: AiItemType.CLASS, label: 'Классы', icon: 'C' },
  { value: AiItemType.METHOD, label: 'Методы', icon: 'M' },
  { value: AiItemType.MODULE, label: 'Модули', icon: '◈' },
  { value: AiItemType.INTERFACE, label: 'Интерфейсы', icon: 'I' },
  { value: AiItemType.STRUCT, label: 'Структуры', icon: 'S' },
  { value: AiItemType.TABLE, label: 'Таблицы', icon: '▤' },
  { value: AiItemType.TABLE_COLUMN, label: 'Колонки таблиц', icon: '│' },
];

const FilterDialog: React.FC<FilterDialogProps> = ({ isOpen, onClose }) => {
  const { currentContextCode, getItemsList, getItemTypes, setItemTypes } = useDataCache();
  const {
    typeFilterEnabled, setTypeFilterEnabled, selectedTypes, toggleType, setAllTypes,
    tagFilterEnabled, setTagFilterEnabled, selectedTagCodes, toggleTag, setAllTags,
  } = useGraphFilter();

  const [allTags, setAllTagsData] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);

  // Состояние для динамически загруженных типов (новый API)
  const [apiTypes, setApiTypes] = useState<import('../types').ItemType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);

  // Position and Size state
  const [position, setPosition] = useState({ x: window.innerWidth - 450, y: 64 });
  const [size, setSize] = useState({ width: 420, height: 550 });

  // Refs for dragging/resizing
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const sizeStartRef = useRef({ width: 0, height: 0 });

  // Получаем уникальные типы из текущих items
  const availableTypes = useMemo(() => {
    const itemsList = getItemsList();
    if (!itemsList?.data) return new Set<string>();
    return new Set(itemsList.data.map(item => item.type));
  }, [getItemsList]);

  // Загрузка тегов
  useEffect(() => {
    if (isOpen && currentContextCode) {
      loadTags();
    }
  }, [isOpen, currentContextCode]);

  const loadTags = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getTags();
      if (res.success) {
        setAllTagsData(res.tags || []);
      }
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setLoading(false);
    }
  };

  // Загрузка типов через API (если включен USE_TYPES_API)
  const loadTypes = async () => {
    if (!USE_TYPES_API) return; // Пропускаем если feature toggle выключен
    
    // Проверяем кэш
    const cached = getItemTypes();
    if (cached) {
      console.log('[FilterDialog] Types loaded from cache:', cached.data.length);
      setApiTypes(cached.data);
      setLoadingTypes(false);
      return;
    }
    
    // Если кэш пуст - загружаем с сервера
    setLoadingTypes(true);
    try {
      const res = await apiClient.getItemTypes();
      if (res.success) {
        setApiTypes(res.types || []);
        // Сохраняем в кэш
        setItemTypes(res.types || [], false);
        console.log('[FilterDialog] Types loaded from API and cached:', res.types.length);
      }
    } catch (err) {
      console.warn('[FilterDialog] Failed to load types from API, using fallback:', err);
      // При ошибке просто не обновляем apiTypes, будет использован хардкод
      setApiTypes([]); // Пустой массив = fallback на ALL_TYPES
    } finally {
      setLoadingTypes(false);
    }
  };

  // Загружаем типы при открытии (если USE_TYPES_API включен)
  useEffect(() => {
    if (isOpen && currentContextCode && USE_TYPES_API) {
      loadTypes();
    }
  }, [isOpen, currentContextCode]);

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
        width: Math.max(350, sizeStartRef.current.width + deltaX),
        height: Math.max(400, sizeStartRef.current.height + deltaY)
      });
    }
  }, []);

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

  // Helper функции для работы с типами
  
  // Получить иконку для типа (с поддержкой кастомных)
  const getTypeIcon = (code: string, isSystem: boolean): string => {
    if (!isSystem) return '⚙'; // Кастомные типы
    
    const iconMap: Record<string, string> = {
      'function': 'ƒ',
      'class': 'C',
      'method': 'M',
      'module': '◈',
      'interface': 'I',
      'struct': 'S',
      'table': '▤',
      'table_column': '│',
    };
    return iconMap[code] || '?';
  };

  // Получить список типов для отображения
  const typesToDisplay = USE_TYPES_API && apiTypes.length > 0
    ? apiTypes
    : ALL_TYPES.map(t => ({
        id: 0,
        code: t.value,
        name: t.label,
        description: null,
        is_system: true,
        created_at: '',
        updated_at: null,
      }));

  // Хелперы для master-чекбоксов
  const allTypesSelected = typesToDisplay.every(t => selectedTypes.has(t.code));
  const someTypesSelected = typesToDisplay.some(t => selectedTypes.has(t.code)) && !allTypesSelected;
  
  const allTagsSelected = allTags.length > 0 && allTags.every(t => selectedTagCodes.has(t.code));
  const someTagsSelected = allTags.some(t => selectedTagCodes.has(t.code)) && !allTagsSelected;

  const handleToggleAllTypes = () => {
    if (allTypesSelected) {
      setAllTypes([]);
    } else {
      setAllTypes(typesToDisplay.map(t => t.code));
    }
  };

  const handleToggleAllTags = () => {
    if (allTagsSelected) {
      setAllTags([]);
    } else {
      setAllTags(allTags.map(t => t.code));
    }
  };

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
        {/* Header */}
        <div
          onMouseDown={onMouseDownDrag}
          className="px-3 py-2 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center cursor-move select-none"
        >
          <div className="flex items-center gap-2">
            <div className="bg-cyan-500/20 p-1 rounded">
              <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide">Фильтры</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* === Секция ТИПЫ === */}
          <div className="border border-slate-700 rounded-lg overflow-hidden">
            <div className="bg-slate-800/60 px-3 py-2 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={typeFilterEnabled}
                  onChange={(e) => setTypeFilterEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-xs font-bold text-slate-200">Учитывать тип</span>
              </label>
              {typeFilterEnabled && (
                <span className="text-[10px] text-slate-500">
                  {selectedTypes.size}/{typesToDisplay.length}
                </span>
              )}
            </div>
            
            {typeFilterEnabled && (
              <div className="p-2 space-y-1 bg-slate-900/50">
                {USE_TYPES_API && loadingTypes ? (
                  <div className="text-[10px] text-slate-500 text-center py-2">
                    Загрузка типов...
                  </div>
                ) : (
                  <>
                    {/* Master checkbox */}
                    <label className="flex items-center gap-2 p-1.5 rounded bg-slate-800/40 cursor-pointer hover:bg-slate-800/60 border-b border-slate-700 mb-1">
                      <input
                        type="checkbox"
                        checked={allTypesSelected}
                        ref={el => { if (el) el.indeterminate = someTypesSelected; }}
                        onChange={handleToggleAllTypes}
                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className="text-[10px] font-medium text-slate-300">Выбрать все</span>
                    </label>
                    
                    {typesToDisplay.map(type => {
                      const isAvailable = availableTypes.has(type.code);
                      const isSelected = selectedTypes.has(type.code);
                      const icon = getTypeIcon(type.code, type.is_system);
                      
                      return (
                        <label
                          key={type.code}
                          className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                            isSelected ? 'bg-cyan-500/10 border border-cyan-500/30' : 'bg-slate-800/30 border border-transparent hover:bg-slate-800/50'
                          } ${!isAvailable ? 'opacity-50' : ''}`}
                          title={type.description || undefined}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleType(type.code)}
                            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                          />
                          <span className="w-5 h-5 flex items-center justify-center bg-slate-700 rounded text-[10px] font-mono text-cyan-400">
                            {icon}
                          </span>
                          <span className="text-[11px] text-slate-200">{type.name}</span>
                          {USE_TYPES_API && !type.is_system && (
                            <span className="text-[9px] text-purple-400 ml-auto">(custom)</span>
                          )}
                          {!isAvailable && <span className="text-[9px] text-slate-500 ml-auto">(нет данных)</span>}
                        </label>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          {/* === Секция ТЕГИ === */}
          <div className="border border-slate-700 rounded-lg overflow-hidden">
            <div className="bg-slate-800/60 px-3 py-2 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tagFilterEnabled}
                  onChange={(e) => setTagFilterEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500"
                />
                <span className="text-xs font-bold text-slate-200">Учитывать теги</span>
              </label>
              {tagFilterEnabled && (
                <span className="text-[10px] text-slate-500">
                  {selectedTagCodes.size}/{allTags.length}
                </span>
              )}
            </div>
            
            {tagFilterEnabled && (
              <div className="p-2 space-y-1 bg-slate-900/50">
                {loading ? (
                  <div className="text-[10px] text-slate-500 text-center py-2">Загрузка тегов...</div>
                ) : allTags.length === 0 ? (
                  <div className="text-[10px] text-slate-500 text-center py-2 italic">Теги не найдены</div>
                ) : (
                  <>
                    {/* Master checkbox */}
                    <label className="flex items-center gap-2 p-1.5 rounded bg-slate-800/40 cursor-pointer hover:bg-slate-800/60 border-b border-slate-700 mb-1">
                      <input
                        type="checkbox"
                        checked={allTagsSelected}
                        ref={el => { if (el) el.indeterminate = someTagsSelected; }}
                        onChange={handleToggleAllTags}
                        className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-[10px] font-medium text-slate-300">Выбрать все</span>
                    </label>
                    
                    {allTags.map(tag => {
                      const isSelected = selectedTagCodes.has(tag.code);
                      return (
                        <label
                          key={tag.id}
                          className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                            isSelected ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-slate-800/30 border border-transparent hover:bg-slate-800/50'
                          }`}
                          title={tag.description || undefined}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTag(tag.code)}
                            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500"
                          />
                          <span className="text-[11px] text-slate-200">{tag.name}</span>
                          <span className="text-[9px] text-slate-500 font-mono">({tag.code})</span>
                        </label>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-700 bg-slate-800/50 flex justify-between items-center shrink-0">
          <div className="text-[9px] text-slate-500">
            {typeFilterEnabled && <span className="mr-2">Типы: {selectedTypes.size}</span>}
            {tagFilterEnabled && <span>Теги: {selectedTagCodes.size}</span>}
          </div>
          <button
            onClick={onClose}
            className="bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold px-3 py-1.5 rounded transition-colors"
          >
            Готово
          </button>
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

export default FilterDialog;