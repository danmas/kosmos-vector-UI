import React, { useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { AiItem } from '../../types';

interface L0SourceViewProps {
  item: AiItem;
}

// Хелпер для форматирования кода
const formatCode = (code: string, language: string): { code: string; isJson: boolean; displayLanguage: string } => {
  const trimmedCode = code?.trim() || '';
  let isJson = false;
  let formattedCode = '';
  let displayLanguage = language || 'text';
  
  try {
    let parsed = JSON.parse(trimmedCode);
    isJson = true;
    displayLanguage = 'json';
    
    // Если результат - строка, которая сама является JSON, парсим ещё раз
    if (typeof parsed === 'string' && (parsed.trim().startsWith('{') || parsed.trim().startsWith('['))) {
      try {
        parsed = JSON.parse(parsed);
      } catch {}
    }
    
    // Рекурсивно обрабатываем escape-последовательности в строках
    const processEscapeSequences = (obj: any): any => {
      if (typeof obj === 'string') {
        return obj
          .replace(/\\r\\n/g, '\n')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\n');
      } else if (Array.isArray(obj)) {
        return obj.map(processEscapeSequences);
      } else if (obj && typeof obj === 'object') {
        const processed: any = {};
        for (const key in obj) {
          processed[key] = processEscapeSequences(obj[key]);
        }
        return processed;
      }
      return obj;
    };
    
    const processed = processEscapeSequences(parsed);
    
    // Кастомное форматирование JSON с сохранением переносов строк
    const formatJsonWithLineBreaks = (obj: any, indent = 0): string => {
      const indentStr = '  '.repeat(indent);
      const nextIndent = '  '.repeat(indent + 1);
      
      if (obj === null) return 'null';
      if (obj === undefined) return 'undefined';
      if (typeof obj === 'string') {
        const escaped = obj
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"');
        return `"${escaped}"`;
      }
      if (typeof obj === 'number' || typeof obj === 'boolean') {
        return String(obj);
      }
      if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        const items = obj.map(item => 
          `${nextIndent}${formatJsonWithLineBreaks(item, indent + 1)}`
        ).join(',\n');
        return `[\n${items}\n${indentStr}]`;
      }
      if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        if (keys.length === 0) return '{}';
        const pairs = keys.map(key => {
          const value = formatJsonWithLineBreaks(obj[key], indent + 1);
          return `${nextIndent}"${key}": ${value}`;
        }).join(',\n');
        return `{\n${pairs}\n${indentStr}}`;
      }
      return String(obj);
    };
    
    formattedCode = formatJsonWithLineBreaks(processed);
  } catch {
    // Если не JSON - обрабатываем escape-последовательности напрямую
    formattedCode = trimmedCode
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n');
  }
  
  return { code: formattedCode, isJson, displayLanguage };
};

const L0SourceView: React.FC<L0SourceViewProps> = ({ item }) => {
  const formattedCode = useMemo(() => {
    return formatCode(item.l0_code, item.language);
  }, [item.l0_code, item.language]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-slate-300 font-semibold text-sm">Source Code</h3>
        <span className="text-xs text-slate-500">Parsed via Tree-sitter</span>
      </div>
      <div className="flex-1 bg-[#0d1117] rounded-lg border border-slate-700 overflow-auto">
        <SyntaxHighlighter
          language={formattedCode.displayLanguage}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '0.5rem',
            fontSize: '0.75rem',
            backgroundColor: '#0d1117',
            fontFamily: 'monospace'
          }}
          showLineNumbers={false}
          wrapLines={true}
          wrapLongLines={true}
        >
          {formattedCode.code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export default L0SourceView;

