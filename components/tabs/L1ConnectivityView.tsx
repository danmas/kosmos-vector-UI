import React from 'react';
import { AiItem, L1Link, L1LinkIn, L1LinkType } from '../../types';

interface L1ConnectivityViewProps {
  item: AiItem;
  usedBy?: { source: string; type?: L1LinkType }[]; // legacy prop
  onItemSelect?: (id: string) => void;
}

// Маппинг типов связей на человекочитаемые метки
const TYPE_LABELS: Record<L1LinkType, string> = {
  calls: 'Вызывает',
  reads_from: 'Читает',
  updates: 'Обновляет',
  inserts_into: 'Вставляет',
  reads_column: 'Читает колонку',
  updates_column: 'Обновляет колонку',
  inserts_column: 'Вставляет в колонку',
  imports: 'Импортирует',
  depends_on: 'Зависит от'
};

// Цвета для типов связей
const TYPE_COLORS: Partial<Record<L1LinkType, string>> = {
  calls: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  reads_from: 'bg-green-500/20 text-green-300 border-green-500/30',
  updates: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  inserts_into: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  reads_column: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  updates_column: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  inserts_column: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  imports: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  depends_on: 'bg-slate-500/20 text-slate-300 border-slate-500/30'
};

const L1ConnectivityView: React.FC<L1ConnectivityViewProps> = ({ item, onItemSelect }) => {
  // Нормализация: поддержка как новых объектов, так и старых строк (для обратной совместимости)
  const normalizeOutgoing = (links: L1Link[] | string[]): L1Link[] => {
    if (!links || links.length === 0) return [];
    if (typeof links[0] === 'string') {
      // Legacy: массив строк
      return (links as string[]).map(target => ({ target, type: 'depends_on' as L1LinkType }));
    }
    return links as L1Link[];
  };

  const normalizeIncoming = (links: L1LinkIn[] | string[]): L1LinkIn[] => {
    if (!links || links.length === 0) return [];
    if (typeof links[0] === 'string') {
      // Legacy: массив строк
      return (links as string[]).map(source => ({ source, type: 'depends_on' as L1LinkType }));
    }
    return links as L1LinkIn[];
  };

  const outgoing = normalizeOutgoing(item.l1_out);
  const incoming = normalizeIncoming(item.l1_in);

  return (
    <div className="grid grid-cols-2 gap-2 h-full">
      {/* Dependencies (Outgoing) */}
      <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
        <h3 className="text-purple-400 font-bold mb-2 flex items-center gap-1.5 text-sm shrink-0">
          Dependencies 
          <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">{outgoing.length}</span>
        </h3>
        <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
          {outgoing.length > 0 ? (
            outgoing.map((link, idx) => (
              <div 
                key={`${link.target}-${idx}`} 
                onClick={() => onItemSelect?.(link.target)}
                className="p-1.5 bg-slate-800 rounded border border-slate-700 text-xs hover:border-blue-500 cursor-pointer group"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-300 font-mono break-all pr-1 flex-1">{link.target}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${TYPE_COLORS[link.type] || TYPE_COLORS.depends_on}`}>
                    {TYPE_LABELS[link.type] || link.type}
                  </span>
                  <span className="text-slate-500 group-hover:text-blue-400 shrink-0">→</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-slate-500 italic text-xs">No outgoing dependencies.</p>
          )}
        </div>
      </div>

      {/* Used By (Incoming) */}
      <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
        <h3 className="text-emerald-400 font-bold mb-2 flex items-center gap-1.5 text-sm shrink-0">
          Used By 
          <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">{incoming.length}</span>
        </h3>
        <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
          {incoming.length > 0 ? (
            incoming.map((link, idx) => (
              <div 
                key={`${link.source}-${idx}`} 
                onClick={() => onItemSelect?.(link.source)} 
                className="p-1.5 bg-slate-800 rounded border border-slate-700 text-xs hover:border-blue-500 cursor-pointer group"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-300 font-mono break-all pr-1 flex-1">{link.source}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${TYPE_COLORS[link.type] || TYPE_COLORS.depends_on}`}>
                    {TYPE_LABELS[link.type] || link.type}
                  </span>
                  <span className="text-slate-500 group-hover:text-blue-400 shrink-0">←</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-slate-500 italic text-xs">Not referenced by other indexed items.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default L1ConnectivityView;
