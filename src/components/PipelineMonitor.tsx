import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Play, 
  Pause, 
  Square, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Activity,
  FileText,
  Settings,
  TrendingUp
} from 'lucide-react';

interface PipelineStep {
  id: number;
  name: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  itemsProcessed: number;
  totalItems: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

interface PipelineStatus {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  steps: PipelineStep[];
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  config: any;
  results: any;
}

interface PipelineConfig {
  projectPath: string;
  filePatterns: string[];
  selectedFiles: string[];
  excludedFiles: string[];
  forceReparse: boolean;
  llmModel: string;
  embeddingModel: string;
}

const DEFAULT_CONFIG: PipelineConfig = {
  projectPath: '',
  filePatterns: ['**/*.{py,ts,js,go,java}'],
  selectedFiles: [],
  excludedFiles: [],
  forceReparse: false,
  llmModel: 'gemini-2.5-flash',
  embeddingModel: 'text-embedding-ada-002'
};

export const PipelineMonitor: React.FC = () => {
  const [pipelines, setPipelines] = useState<PipelineStatus[]>([]);
  const [activePipeline, setActivePipeline] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [config, setConfig] = useState<PipelineConfig>(DEFAULT_CONFIG);
  const [logs, setLogs] = useState<any[]>([]);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [errors, setErrors] = useState<any[]>([]);
  
  // SSE connections
  const sseRef = useRef<EventSource | null>(null);
  const globalSseRef = useRef<EventSource | null>(null);

  // Fetch initial data
  useEffect(() => {
    fetchPipelines();
    fetchGlobalStats();
    fetchErrors();
    
    // Setup global SSE connection
    setupGlobalSSE();
    
    return () => {
      cleanupSSE();
    };
  }, []);

  // Setup SSE for active pipeline
  useEffect(() => {
    if (activePipeline) {
      setupPipelineSSE(activePipeline);
    } else {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    }
    
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [activePipeline]);

  const fetchPipelines = async () => {
    try {
      const response = await fetch('/api/pipeline');
      if (response.ok) {
        const data = await response.json();
        setPipelines(data.pipelines || []);
      }
    } catch (error) {
      console.error('Failed to fetch pipelines:', error);
    }
  };

  const fetchGlobalStats = async () => {
    try {
      const response = await fetch('/api/pipeline/stats/global');
      if (response.ok) {
        const data = await response.json();
        setGlobalStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch global stats:', error);
    }
  };

  const fetchErrors = async () => {
    try {
      const response = await fetch('/api/pipeline/errors');
      if (response.ok) {
        const data = await response.json();
        setErrors(data.recentErrors || []);
      }
    } catch (error) {
      console.error('Failed to fetch errors:', error);
    }
  };

  const setupGlobalSSE = () => {
    if (globalSseRef.current) return;
    
    // EventSource не использует прокси Vite, поэтому нужен полный URL бэкенда
    const backendPort = import.meta.env.VITE_BACKEND_PORT || 3200;
    const backendUrl = `http://localhost:${backendPort}`;
    globalSseRef.current = new EventSource(`${backendUrl}/api/pipeline/stream/global`);
    
    globalSseRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'global_stats_update':
            setGlobalStats(data.stats);
            break;
          case 'progress':
          case 'step_completed':
          case 'step_failed':
          case 'completed':
          case 'failed':
            // Update pipeline list
            fetchPipelines();
            break;
        }
      } catch (error) {
        console.error('Error parsing global SSE data:', error);
      }
    };
    
    globalSseRef.current.onerror = (error) => {
      console.error('Global SSE error:', error);
    };
  };

  const setupPipelineSSE = (pipelineId: string) => {
    if (sseRef.current) {
      sseRef.current.close();
    }
    
    // EventSource не использует прокси Vite, поэтому нужен полный URL бэкенда
    const backendPort = import.meta.env.VITE_BACKEND_PORT || 3200;
    const backendUrl = `http://localhost:${backendPort}`;
    sseRef.current = new EventSource(`${backendUrl}/api/pipeline/${pipelineId}/stream`);
    
    sseRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'progress':
            updatePipelineProgress(pipelineId, data);
            break;
          case 'step_completed':
            addLog(`Step completed: ${data.step}`, 'success');
            break;
          case 'step_failed':
            addLog(`Step failed: ${data.step} - ${data.error}`, 'error');
            break;
          case 'completed':
            addLog(`Pipeline completed successfully`, 'success');
            break;
          case 'failed':
            addLog(`Pipeline failed: ${data.error}`, 'error');
            break;
          case 'status':
            updatePipelineFromStatus(data.status);
            break;
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };
    
    sseRef.current.onerror = (error) => {
      console.error('Pipeline SSE error:', error);
    };
  };

  const cleanupSSE = () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (globalSseRef.current) {
      globalSseRef.current.close();
      globalSseRef.current = null;
    }
  };

  const updatePipelineProgress = (pipelineId: string, data: any) => {
    setPipelines(prev => prev.map(pipeline => {
      if (pipeline.id === pipelineId) {
        const updatedSteps = pipeline.steps.map(step => {
          if (step.id === data.step) {
            return {
              ...step,
              status: 'running',
              progress: data.progress,
              itemsProcessed: data.itemsProcessed || 0,
              totalItems: data.totalItems || 0
            };
          }
          return step;
        });
        
        return {
          ...pipeline,
          steps: updatedSteps,
          currentStep: data.step
        };
      }
      return pipeline;
    }));
    
    addLog(`${data.stepName}: ${data.progress}% - ${data.message}`, 'info');
  };

  const updatePipelineFromStatus = (status: PipelineStatus) => {
    setPipelines(prev => {
      const index = prev.findIndex(p => p.id === status.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = status;
        return updated;
      } else {
        return [...prev, status];
      }
    });
  };

  const addLog = (message: string, level: 'info' | 'success' | 'error' | 'warning') => {
    setLogs(prev => [{
      id: Date.now(),
      timestamp: new Date().toISOString(),
      message,
      level
    }, ...prev.slice(0, 99)]);
  };

  const startPipeline = async () => {
    setIsStarting(true);
    
    try {
      const response = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      if (response.ok) {
        const data = await response.json();
        setActivePipeline(data.pipeline.pipelineId);
        addLog(`Started pipeline ${data.pipeline.pipelineId}`, 'success');
        fetchPipelines();
      } else {
        const error = await response.json();
        addLog(`Failed to start pipeline: ${error.error}`, 'error');
      }
    } catch (error) {
      addLog(`Error starting pipeline: ${error}`, 'error');
    } finally {
      setIsStarting(false);
    }
  };

  const cancelPipeline = async (pipelineId: string) => {
    try {
      const response = await fetch(`/api/pipeline/${pipelineId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        addLog(`Cancelled pipeline ${pipelineId}`, 'warning');
        fetchPipelines();
        if (activePipeline === pipelineId) {
          setActivePipeline(null);
        }
      }
    } catch (error) {
      addLog(`Error cancelling pipeline: ${error}`, 'error');
    }
  };

  const formatDuration = (start: number, end?: number | null) => {
    const endTime = end || Date.now();
    const duration = Math.floor((endTime - start) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'cancelled': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'running': return <Activity className="h-4 w-4 animate-spin" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Knowledge Processing Pipeline</h1>
        <Button 
          onClick={startPipeline} 
          disabled={isStarting}
          className="flex items-center gap-2"
        >
          <Play className="h-4 w-4" />
          {isStarting ? 'Starting...' : 'Start New Pipeline'}
        </Button>
      </div>

      {/* Global Stats */}
      {globalStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-gray-600">Active Pipelines</p>
                  <p className="text-2xl font-bold">{globalStats.activePipelines}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm text-gray-600">Items Processed</p>
                  <p className="text-2xl font-bold">{globalStats.totalItemsProcessed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-sm text-gray-600">Avg Progress</p>
                  <p className="text-2xl font-bold">{Math.round(globalStats.averageProgress)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm text-gray-600">Recent Errors</p>
                  <p className="text-2xl font-bold">{errors.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="pipelines" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>

        <TabsContent value="pipelines" className="space-y-4">
          {pipelines.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-500">No pipelines running. Start a new pipeline to begin processing.</p>
              </CardContent>
            </Card>
          ) : (
            pipelines.map(pipeline => (
              <Card key={pipeline.id} className={`border-l-4 ${activePipeline === pipeline.id ? 'border-l-blue-500' : 'border-l-gray-200'}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={getStatusColor(pipeline.status)}>
                        {pipeline.status}
                      </Badge>
                      <CardTitle className="text-lg">Pipeline {pipeline.id.slice(0, 8)}</CardTitle>
                      {pipeline.startedAt && (
                        <span className="text-sm text-gray-500">
                          Duration: {formatDuration(pipeline.startedAt, pipeline.completedAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActivePipeline(activePipeline === pipeline.id ? null : pipeline.id)}
                      >
                        {activePipeline === pipeline.id ? 'Disconnect' : 'Monitor'}
                      </Button>
                      {pipeline.status === 'running' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => cancelPipeline(pipeline.id)}
                        >
                          <Square className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  {pipeline.error && (
                    <Alert className="mb-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{pipeline.error}</AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="space-y-3">
                    {pipeline.steps.map(step => (
                      <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg border">
                        {getStepIcon(step.status)}
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{step.label}</span>
                            <span className="text-sm text-gray-500">
                              {step.itemsProcessed}/{step.totalItems} items
                            </span>
                          </div>
                          <Progress value={step.progress} className="h-2" />
                        </div>
                        <span className="text-sm font-medium">{step.progress}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Pipeline Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Project Path</label>
                <input
                  type="text"
                  value={config.projectPath}
                  onChange={(e) => setConfig({...config, projectPath: e.target.value})}
                  placeholder="Enter project root path"
                  className="w-full p-2 border rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">File Patterns</label>
                <input
                  type="text"
                  value={config.filePatterns.join(', ')}
                  onChange={(e) => setConfig({...config, filePatterns: e.target.value.split(', ')})}
                  placeholder="**/*.{py,ts,js,go,java}"
                  className="w-full p-2 border rounded-md"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">LLM Model</label>
                  <select
                    value={config.llmModel}
                    onChange={(e) => setConfig({...config, llmModel: e.target.value})}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-pro">Gemini Pro</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Embedding Model</label>
                  <select
                    value={config.embeddingModel}
                    onChange={(e) => setConfig({...config, embeddingModel: e.target.value})}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="text-embedding-ada-002">OpenAI Ada-002</option>
                    <option value="embedding-gecko-001">Google Gecko</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Selected Files ({config.selectedFiles.length} files)
                </label>
                {config.selectedFiles.length > 0 ? (
                  <div className="max-h-32 overflow-y-auto bg-gray-50 border rounded p-2">
                    {config.selectedFiles.map((file, index) => (
                      <div key={index} className="text-xs text-gray-600 py-1 flex items-center justify-between">
                        <span className="truncate flex-1">{file}</span>
                        <button
                          onClick={() => {
                            const newFiles = config.selectedFiles.filter((_, i) => i !== index);
                            setConfig({...config, selectedFiles: newFiles});
                          }}
                          className="ml-2 text-red-500 hover:text-red-700 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 p-2 border rounded bg-gray-50">
                    No specific files selected. Will use file patterns for discovery.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="forceReparse"
                  checked={config.forceReparse}
                  onChange={(e) => setConfig({...config, forceReparse: e.target.checked})}
                />
                <label htmlFor="forceReparse" className="text-sm">Force re-parse all files</label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Real-time Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                {logs.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No logs yet. Start a pipeline to see activity.</p>
                ) : (
                  <div className="space-y-2">
                    {logs.map(log => (
                      <div key={log.id} className={`p-2 rounded text-sm ${
                        log.level === 'error' ? 'bg-red-50 text-red-700' :
                        log.level === 'warning' ? 'bg-yellow-50 text-yellow-700' :
                        log.level === 'success' ? 'bg-green-50 text-green-700' :
                        'bg-gray-50 text-gray-700'
                      }`}>
                        <span className="text-xs opacity-75">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="ml-2">{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Error Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              {errors.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No recent errors. Great!</p>
              ) : (
                <div className="space-y-3">
                  {errors.map((error, index) => (
                    <Alert key={index}>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="flex justify-between items-start">
                          <span>{error.message}</span>
                          <span className="text-xs text-gray-500">
                            {new Date(error.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {error.context && (
                          <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                            {JSON.stringify(error.context, null, 2)}
                          </pre>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
