import React, { useState, useEffect } from 'react';
import { ItemType, ItemTypeCreateRequest, ItemTypeUpdateRequest } from '../../types';
import { apiClient } from '../../services/apiClient';
import { useDataCache } from '../../lib/context/DataCacheContext';

interface TypesConfigTabProps {
  // Пропсы для совместимости с другими табами
}

const TypesConfigTab: React.FC<TypesConfigTabProps> = () => {
  const { invalidate } = useDataCache();
  const [types, setTypes] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<ItemType | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<ItemTypeCreateRequest>({ code: '', name: '', description: '' });

  // Загрузка типов
  const loadTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getItemTypes();
      if (res.success) {
        setTypes(res.types || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTypes();
  }, []);

  // Создание типа
  const handleCreate = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      alert('Код и название обязательны');
      return;
    }

    try {
      await apiClient.createItemType(formData);
      setFormData({ code: '', name: '', description: '' });
      setIsCreating(false);
      // Инвалидируем кэш типов
      invalidate();
      await loadTypes();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create type');
    }
  };

  // Обновление типа
  const handleUpdate = async () => {
    if (!editingType) return;

    const updates: ItemTypeUpdateRequest = {
      name: formData.name,
      description: formData.description || null,
    };

    try {
      await apiClient.updateItemType(editingType.code, updates);
      setEditingType(null);
      setFormData({ code: '', name: '', description: '' });
      // Инвалидируем кэш типов
      invalidate();
      await loadTypes();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update type');
    }
  };

  // Удаление типа
  const handleDelete = async (type: ItemType) => {
    if (type.is_system) {
      alert('Системный тип нельзя удалить');
      return;
    }

    if (!window.confirm(`Удалить тип "${type.name}" (${type.code})?`)) return;

    try {
      await apiClient.deleteItemType(type.code);
      // Инвалидируем кэш типов
      invalidate();
      await loadTypes();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete type');
    }
  };

  // Начать редактирование
  const startEdit = (type: ItemType) => {
    if (type.is_system) {
      alert('Системный тип можно редактировать только название и описание');
    }
    setEditingType(type);
    setFormData({
      code: type.code,
      name: type.name,
      description: type.description || '',
    });
    setIsCreating(false);
  };

  // Отменить редактирование
  const cancelEdit = () => {
    setEditingType(null);
    setIsCreating(false);
    setFormData({ code: '', name: '', description: '' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-400">Загрузка типов...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700/30 rounded p-4">
        <h3 className="text-red-400 font-semibold mb-2">Ошибка загрузки</h3>
        <p className="text-red-300 text-sm">{error}</p>
        <button
          onClick={loadTypes}
          className="mt-3 bg-red-700 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-sm font-semibold text-white">Управление типами AI Items</h3>
          <p className="text-xs text-slate-400 mt-1">
            Системные типы ({types.filter(t => t.is_system).length}) нельзя удалять.
            Кастомные типы ({types.filter(t => !t.is_system).length}) можно редактировать и удалять.
          </p>
        </div>
        {!isCreating && !editingType && (
          <button
            onClick={() => setIsCreating(true)}
            className="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать тип
          </button>
        )}
      </div>

      {/* Форма создания/редактирования */}
      {(isCreating || editingType) && (
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-3">
          <h4 className="text-xs font-bold text-white">
            {isCreating ? 'Создание нового типа' : `Редактирование: ${editingType?.code}`}
          </h4>

          <div className="grid grid-cols-2 gap-3">
            {/* Код (только при создании) */}
            {isCreating && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Код типа <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="custom-type"
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Английские буквы, цифры, дефис. Уникален в рамках контекста.
                </p>
              </div>
            )}

            {/* Название */}
            <div className={isCreating ? '' : 'col-span-2'}>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Название <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Пользовательский тип"
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Описание */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Описание
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Описание типа (опционально)"
              rows={2}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-none"
            />
          </div>

          {/* Кнопки */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={cancelEdit}
              className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-3 py-1.5 rounded"
            >
              Отмена
            </button>
            <button
              onClick={isCreating ? handleCreate : handleUpdate}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded"
            >
              {isCreating ? 'Создать' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}

      {/* Список типов */}
      <div className="space-y-2">
        {types.map((type) => (
          <div
            key={type.id}
            className={`bg-slate-900/30 border rounded-lg p-3 ${
              type.is_system ? 'border-slate-700' : 'border-purple-700/30'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-bold text-white">{type.name}</h4>
                  <code className="text-xs bg-slate-800 text-cyan-400 px-1.5 py-0.5 rounded">
                    {type.code}
                  </code>
                  {type.is_system ? (
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded">
                      system
                    </span>
                  ) : (
                    <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded">
                      custom
                    </span>
                  )}
                </div>
                {type.description && (
                  <p className="text-xs text-slate-400">{type.description}</p>
                )}
                <div className="flex gap-3 mt-1 text-[10px] text-slate-500">
                  <span>ID: {type.id}</span>
                  <span>Создан: {new Date(type.created_at).toLocaleDateString('ru-RU')}</span>
                  {type.updated_at && (
                    <span>Изменён: {new Date(type.updated_at).toLocaleDateString('ru-RU')}</span>
                  )}
                </div>
              </div>

              {/* Кнопки действий */}
              <div className="flex gap-1 ml-3">
                <button
                  onClick={() => startEdit(type)}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-1 rounded"
                  title="Редактировать"
                >
                  ✏️
                </button>
                {!type.is_system && (
                  <button
                    onClick={() => handleDelete(type)}
                    className="bg-red-700 hover:bg-red-600 text-white text-xs px-2 py-1 rounded"
                    title="Удалить"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {types.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm">
          Типы не найдены
        </div>
      )}
    </div>
  );
};

export default TypesConfigTab;
