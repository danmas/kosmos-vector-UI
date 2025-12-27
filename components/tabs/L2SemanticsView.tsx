import React, { useState, useEffect } from 'react';
import { Cpu, Edit2, Trash2, Save, X } from 'lucide-react';
import { AiItem, AiCommentResponse } from '../../types';
import { apiClient } from '../../services/apiClient';
import LogicArchitectDialog from '../LogicArchitectDialog';

interface L2SemanticsViewProps {
  item: AiItem;
  showEmbeddings?: boolean;
}

const L2SemanticsView: React.FC<L2SemanticsViewProps> = ({ item, showEmbeddings = true }) => {
  const [showLogicDialog, setShowLogicDialog] = useState(false);
  const [comment, setComment] = useState<AiCommentResponse | null>(null);
  const [loadingComment, setLoadingComment] = useState(false);
  const [editingComment, setEditingComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Загрузка комментария при изменении item.id
  useEffect(() => {
    const loadComment = async () => {
      setLoadingComment(true);
      setError(null);
      try {
        const response = await apiClient.getComment(item.id);
        setComment(response);
        setCommentText(response.comment || '');
      } catch (err: any) {
        // 404 - это нормально, комментария просто нет
        if (err.status === 404) {
          setComment(null);
          setCommentText('');
        } else {
          console.error('Ошибка загрузки комментария:', err);
          setError(err.message || 'Не удалось загрузить комментарий');
        }
      } finally {
        setLoadingComment(false);
      }
    };

    loadComment();
    // Сбрасываем режим редактирования при смене элемента
    setEditingComment(false);
  }, [item.id]);

  const handleSaveComment = async () => {
    if (!commentText.trim()) {
      setError('Комментарий не может быть пустым');
      return;
    }

    setSavingComment(true);
    setError(null);
    try {
      const response = await apiClient.saveComment(item.id, commentText.trim());
      setComment(response);
      setEditingComment(false);
    } catch (err: any) {
      console.error('Ошибка сохранения комментария:', err);
      setError(err.message || 'Не удалось сохранить комментарий');
    } finally {
      setSavingComment(false);
    }
  };

  const handleDeleteComment = async () => {
    if (!confirm('Удалить комментарий?')) return;

    setSavingComment(true);
    setError(null);
    try {
      await apiClient.deleteComment(item.id);
      setComment(null);
      setCommentText('');
      setEditingComment(false);
    } catch (err: any) {
      console.error('Ошибка удаления комментария:', err);
      setError(err.message || 'Не удалось удалить комментарий');
    } finally {
      setSavingComment(false);
    }
  };

  const handleStartEdit = () => {
    setCommentText(comment?.comment || '');
    setEditingComment(true);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingComment(false);
    setCommentText(comment?.comment || '');
    setError(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-blue-300 font-bold text-sm">Semantic Analysis</h3>
        <button
          onClick={() => setShowLogicDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
        >
          <Cpu className="w-4 h-4" />
          Logic Architect
        </button>
      </div>

      <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 p-3 rounded-xl border border-slate-700 mb-3">
        <h3 className="text-blue-300 font-bold mb-1 text-sm">Generated Description</h3>
        <p className="text-sm text-slate-200 leading-relaxed">{item.l2_desc}</p>
      </div>

      {/* AI Comment Section */}
      <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 p-3 rounded-xl border border-slate-700 mb-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-green-300 font-bold text-sm">AI Comment</h3>
          {!loadingComment && !editingComment && comment?.comment && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleStartEdit}
                className="p-1.5 hover:bg-green-900/30 rounded transition-colors"
                title="Редактировать"
              >
                <Edit2 className="w-4 h-4 text-green-400" />
              </button>
              <button
                onClick={handleDeleteComment}
                className="p-1.5 hover:bg-red-900/30 rounded transition-colors"
                title="Удалить"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          )}
        </div>

        {loadingComment ? (
          <div className="text-sm text-slate-400">Загрузка комментария...</div>
        ) : editingComment ? (
          <div className="space-y-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Введите комментарий..."
              className="w-full bg-slate-900/50 border border-slate-600 rounded-lg p-2 text-sm text-slate-200 placeholder-slate-500 focus:border-green-500 focus:outline-none resize-y min-h-[80px] max-h-[300px] overflow-y-auto"
              rows={4}
            />
            {error && (
              <div className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded p-2">
                {error}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveComment}
                disabled={savingComment}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-3.5 h-3.5" />
                Сохранить
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={savingComment}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-3.5 h-3.5" />
                Отмена
              </button>
            </div>
          </div>
        ) : comment?.comment ? (
          <div className="space-y-2">
            <div className="text-sm text-slate-200 leading-relaxed max-h-[300px] overflow-y-auto whitespace-pre-wrap">
              {comment.comment}
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1 pt-1 border-t border-slate-700/50">
              <span>📅</span>
              <span>
                Обновлено: {formatDate(comment.updatedAt || comment.createdAt)}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm text-slate-400 italic">Комментарий отсутствует</div>
            <button
              onClick={() => setEditingComment(true)}
              className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded text-xs font-semibold transition-colors border border-green-700/30"
            >
              Добавить комментарий
            </button>
          </div>
        )}
      </div>

      {showEmbeddings && (
        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
          <h3 className="text-slate-400 text-xs uppercase tracking-widest font-bold mb-2">Vector Embeddings Preview</h3>
          <div className="flex flex-wrap gap-0.5">
            {Array.from({ length: 48 }).map((_, i) => (
              <div 
                key={i} 
                className="w-2.5 h-2.5 rounded-sm"
                style={{ 
                  backgroundColor: `rgba(59, 130, 246, ${Math.random() * 0.8 + 0.2})` 
                }}
              />
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1.5 font-mono">Dimensions: 1536 (Ada-002 Compatible)</p>
        </div>
      )}

      <LogicArchitectDialog
        isOpen={showLogicDialog}
        onClose={() => setShowLogicDialog(false)}
        item={item}
      />
    </div>
  );
};

export default L2SemanticsView;

