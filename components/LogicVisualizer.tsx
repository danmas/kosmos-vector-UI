import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { LogicGraph, LogicNodeType } from '../types';
import { Maximize2, RefreshCcw } from 'lucide-react';

interface Props {
  graph: LogicGraph | null;
  isLoading: boolean;
}

const COLOR_MAP: Record<LogicNodeType, string> = {
  start: '#10b981', // emerald
  end: '#ef4444',   // red
  decision: '#f59e0b', // amber
  process: '#3b82f6', // blue
  db_call: '#8b5cf6', // violet
  exception: '#ec4899', // pink
};

const LogicVisualizer: React.FC<Props> = ({ graph, isLoading }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!graph || !svgRef.current || !containerRef.current) return;

    const nodes = graph.nodes.map(d => ({ ...d }));
    const nodeIds = new Set(nodes.map(n => n.id));
    
    const links = graph.edges
      .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map(e => ({
        ...e,
        source: e.from,
        target: e.to
      }));

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Улучшенная симуляция сил
    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(220))
      .force('charge', d3.forceManyBody().strength(-1500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(130))
      // Сила для позиционирования Start сверху, а End снизу
      .force('y', d3.forceY().y((d: any) => {
        if (d.type === 'start') return height * 0.1;
        if (d.type === 'end') return height * 0.9;
        return height / 2;
      }).strength((d: any) => {
        if (d.type === 'start' || d.type === 'end') return 0.5;
        return 0.05;
      }))
      // Немного растягиваем по горизонтали
      .force('x', d3.forceX(width / 2).strength(0.05));

    // Стрелки для связей
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 38)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#475569');

    // Отрисовка линий связей
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#334155')
      .attr('stroke-width', 2.5)
      .attr('marker-end', 'url(#arrowhead)');

    // Метки на связях (True/False)
    const edgeLabels = g.append('g')
      .selectAll('text')
      .data(links)
      .enter().append('text')
      .attr('font-size', '12px')
      .attr('fill', '#94a3b8')
      .attr('font-weight', '600')
      .attr('text-anchor', 'middle')
      .attr('dy', -10)
      .text(d => d.label || '');

    // Контейнеры для узлов
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .call(d3.drag<SVGGElement, any>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x; d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      );

    // Рисование геометрических форм
    node.each(function(d: any) {
      const el = d3.select(this);
      const color = COLOR_MAP[d.type as LogicNodeType] || '#ffffff';

      if (d.type === 'decision') {
        const w = 90; 
        const h = 28; 
        const tip = 22; 
        
        el.append('path')
          .attr('d', `M ${-(w+tip)} 0 L ${-w} ${-h} L ${w} ${-h} L ${w+tip} 0 L ${w} ${h} L ${-w} ${h} Z`)
          .attr('fill', '#0f172a')
          .attr('stroke', color)
          .attr('stroke-width', 2.5);
      } else {
        el.append('rect')
          .attr('width', 180)
          .attr('height', 56)
          .attr('x', -90)
          .attr('y', -28)
          .attr('rx', d.type === 'start' || d.type === 'end' ? 28 : 10)
          .attr('fill', '#0f172a')
          .attr('stroke', color)
          .attr('stroke-width', 2.5);
      }
    });

    // Текст внутри узлов
    node.append('text')
      .attr('dy', 5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#f1f5f9')
      .attr('font-size', '12px')
      .attr('font-weight', '700')
      .attr('pointer-events', 'none')
      .text(d => d.label.length > 28 ? d.label.substring(0, 25) + '...' : d.label);

    node.append('title')
      .text(d => `${d.label}\n\n${d.details || ''}`);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      edgeLabels
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Остановка симуляции после того как она "успокоится"
    setTimeout(() => simulation.alphaTarget(0).stop(), 6000);
  }, [graph]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-950 overflow-hidden border border-slate-800 rounded-xl shadow-inner">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <RefreshCcw className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
          <p className="text-slate-300 font-medium tracking-wide">Рассчитываем логические связи...</p>
        </div>
      )}
      
      {!graph && !isLoading && (
        <div className="flex flex-col items-center justify-center h-full text-slate-700 p-8 text-center">
          <div className="p-6 bg-slate-900 rounded-full mb-6 border border-slate-800/50 opacity-20">
            <Maximize2 className="w-16 h-16" />
          </div>
          <p className="max-w-xs text-lg font-medium">Готов к визуализации вашего кода</p>
          <p className="text-sm opacity-50 mt-2">Вставьте JSON описание функции слева</p>
        </div>
      )}

      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      
      {graph && (
        <div className="absolute bottom-6 right-6 flex flex-col gap-2 bg-slate-900/90 p-4 rounded-xl border border-slate-800 backdrop-blur-md shadow-2xl">
          <div className="text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-widest border-b border-slate-800 pb-2">Условные обозначения</div>
          {Object.entries(COLOR_MAP).map(([type, color]) => (
            <div key={type} className="flex items-center gap-3 group">
              <div className="w-3 h-3 rounded-full shadow-[0_0_8px] shadow-current" style={{ color: color, backgroundColor: color }} />
              <span className="text-xs text-slate-400 capitalize font-medium group-hover:text-slate-200 transition-colors">{type.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LogicVisualizer;

