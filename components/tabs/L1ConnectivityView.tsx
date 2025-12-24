import React from 'react';
import { AiItem, AiItemSummary } from '../../types';

interface L1ConnectivityViewProps {
  item: AiItem;
  usedBy: AiItemSummary[];
  onItemSelect?: (id: string) => void;
}

const L1ConnectivityView: React.FC<L1ConnectivityViewProps> = ({ item, usedBy, onItemSelect }) => {
  return (
    <div className="grid grid-cols-2 gap-2 h-full">
      {/* Dependencies */}
      <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
        <h3 className="text-purple-400 font-bold mb-2 flex items-center gap-1.5 text-sm shrink-0">
          Dependencies 
          <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">{item.l1_deps.length}</span>
        </h3>
        <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
          {item.l1_deps.length > 0 ? (
            item.l1_deps.map((dep, idx) => {
              // Проверяем, является ли dep JSON-строкой
              let formattedDep: string = dep;
              let isJson = false;
              try {
                const parsed = JSON.parse(dep);
                if (typeof parsed === 'object' && parsed !== null) {
                  formattedDep = JSON.stringify(parsed, null, 2);
                  isJson = true;
                }
              } catch {
                // Не JSON, оставляем как есть
              }
              
              return (
                <div 
                  key={`${dep}-${idx}`} 
                  className="p-1.5 bg-slate-800 rounded border border-slate-700 text-xs hover:border-blue-500 cursor-pointer group"
                >
                  {isJson ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-start">
                        <span className="text-slate-400 text-[10px] uppercase">JSON Dependency</span>
                        <span className="text-slate-500 group-hover:text-blue-400 shrink-0">→</span>
                      </div>
                      <pre className="text-slate-300 font-mono text-[10px] overflow-x-auto whitespace-pre-wrap break-all">
                        <code>{formattedDep}</code>
                      </pre>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300 font-mono break-all pr-1">{dep}</span>
                      <span className="text-slate-500 group-hover:text-blue-400 shrink-0">→</span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-slate-500 italic text-xs">No outgoing dependencies.</p>
          )}
        </div>
      </div>

      {/* Used By */}
      <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
        <h3 className="text-emerald-400 font-bold mb-2 flex items-center gap-1.5 text-sm shrink-0">
          Used By 
          <span className="text-xs bg-slate-700 text-white px-1.5 py-0.5 rounded-full">{usedBy.length}</span>
        </h3>
        <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
          {usedBy.length > 0 ? (
            usedBy.map(u => (
              <div 
                key={u.id} 
                onClick={() => onItemSelect?.(u.id)} 
                className="p-1.5 bg-slate-800 rounded border border-slate-700 text-xs hover:border-blue-500 cursor-pointer flex justify-between group"
              >
                <span className="text-slate-300 font-mono break-all pr-1">{u.id}</span>
                <span className="text-slate-500 group-hover:text-blue-400 shrink-0">←</span>
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

