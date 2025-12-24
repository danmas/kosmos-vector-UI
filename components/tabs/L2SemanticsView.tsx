import React, { useState } from 'react';
import { Cpu } from 'lucide-react';
import { AiItem } from '../../types';
import LogicArchitectDialog from '../LogicArchitectDialog';

interface L2SemanticsViewProps {
  item: AiItem;
  showEmbeddings?: boolean;
}

const L2SemanticsView: React.FC<L2SemanticsViewProps> = ({ item, showEmbeddings = true }) => {
  const [showLogicDialog, setShowLogicDialog] = useState(false);

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

