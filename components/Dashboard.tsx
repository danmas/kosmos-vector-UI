import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import { getStatsWithFallback, DashboardStats } from '../services/apiClient';
import { useDataCache } from '../lib/context/DataCacheContext';

interface DashboardProps {
  // Props are now optional since we fetch data internally
}

const Dashboard: React.FC<DashboardProps> = () => {
  const { currentContextCode } = useDataCache();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      setIsLoading(true);
      setError(null);
      
      // Синхронно обновляем window.g_context_code перед запросом
      // чтобы API использовал правильный контекст
      if (typeof window !== 'undefined') {
        (window as any).g_context_code = currentContextCode;
      }
      
      try {
        console.log(`[Dashboard] Fetching stats for context: ${currentContextCode}`);
        const result = await getStatsWithFallback();
        setStats(result.data);
        setIsDemoMode(result.isDemo);
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard statistics');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [currentContextCode]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  if (isLoading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400">Loading dashboard statistics...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-6">
          <h3 className="text-red-400 font-semibold mb-2">Error Loading Dashboard</h3>
          <p className="text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="text-slate-400">No statistics available</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-white mb-6">Project Overview</h2>
      
      {isDemoMode && (
        <div className="bg-amber-900/20 border border-amber-700/30 text-amber-400/80 text-sm px-4 py-2 rounded-lg mb-6 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <span><b>Demo Mode:</b> Displaying mock statistics (API unavailable)</span>
        </div>
      )}
      
      {/* API v2.1.1 Migration Info */}
      <div className="bg-blue-900/20 border border-blue-700/30 text-blue-400/80 text-sm px-4 py-3 rounded-lg mb-6 flex items-start gap-3">
        <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-blue-400 text-xs font-bold">✓</span>
        </div>
        <div>
          <div className="font-semibold mb-1">API v2.1.1 Migration Completed</div>
          <div className="text-blue-300/70 text-xs space-y-1">
            <div>• <b>New Project Tree API:</b> GET /api/project/tree with file size and language detection</div>
            <div>• <b>File Selection API:</b> POST /api/project/selection for precise file choosing</div>
            <div>• <b>Enhanced KB Config:</b> rootPath + fileSelection priority over glob patterns</div>
            <div>• <b>Backward Compatible:</b> Legacy /api/files still supported with deprecation warnings</div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h3 className="text-slate-400 text-sm uppercase tracking-wide font-semibold">Total AiItems</h3>
          <p className="text-4xl font-bold text-white mt-2">{stats.totalItems}</p>
          <p className="text-green-400 text-sm mt-2">↑ 12% from last scan</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h3 className="text-slate-400 text-sm uppercase tracking-wide font-semibold">Knowledge Links (L1)</h3>
          <p className="text-4xl font-bold text-blue-400 mt-2">{stats.totalDeps}</p>
          <p className="text-slate-500 text-sm mt-2">Dependency Density: {stats.averageDependencyDensity}</p>
        </div>
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
          <h3 className="text-slate-400 text-sm uppercase tracking-wide font-semibold">Vector Index Size</h3>
          <p className="text-4xl font-bold text-purple-400 mt-2">{stats.vectorIndexSize}</p>
          <p className="text-slate-500 text-sm mt-2">FAISS Index optimized</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 h-80">
          <h3 className="text-white font-semibold mb-4">AiItem Distribution by Type</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.typeStats || []}>
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                itemStyle={{ color: '#3b82f6' }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 h-80">
          <h3 className="text-white font-semibold mb-4">Language Breakdown</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.languageStats || []}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {(stats.languageStats || []).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;