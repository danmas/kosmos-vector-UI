import React, { useState, useRef, useEffect } from 'react';
import { AiItem, ChatMessage } from '../types';
import { apiClient, getItemsWithFallback } from '../services/apiClient';

interface ChatInterfaceProps {
  // Props are now optional since we fetch data internally
}

const ChatInterface: React.FC<ChatInterfaceProps> = () => {
  const [items, setItems] = useState<AiItem[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! I am the AiItem RAG Client. I have analyzed your codebase. Ask me anything about the architecture, functions, or logic.',
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchItems = async () => {
      setItemsLoading(true);
      setItemsError(null);
      
      try {
        const result = await getItemsWithFallback();
        setItems(result.data);
        setIsDemoMode(result.isDemo);
      } catch (err) {
        console.error('Failed to fetch items for chat:', err);
        setItemsError(err instanceof Error ? err.message : 'Failed to load context data');
      } finally {
        setItemsLoading(false);
      }
    };

    fetchItems();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || itemsLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await apiClient.chat(input);

      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.response,
        retrievedContext: items.filter(i => response.usedContextIds.includes(i.id)),
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, modelMsg]);
    } catch (error: any) {
      console.error('Chat error:', error);
      
      let errorText = 'Sorry, I encountered an error processing your request.';
      
      if (error.message && error.message.includes('API_KEY')) {
        errorText = 'API Key is not configured. Please set the API_KEY environment variable on the server.';
      } else if (error.message && error.message.includes('Gemini SDK')) {
        errorText = 'Gemini SDK is not installed on the server. Please run: npm install @google/genai';
      } else if (error.message && error.message.includes('Demo mode')) {
        errorText = 'Chat is not available in demo mode. Please start the backend server.';
      }
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: errorText,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (itemsLoading) {
    return (
      <div className="h-full flex flex-col bg-slate-900">
        <div className="p-4 border-b border-slate-700 bg-slate-800">
          <h2 className="text-lg font-bold text-white">RAG Assistant</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-slate-400">Loading context data...</div>
        </div>
      </div>
    );
  }

  if (itemsError) {
    return (
      <div className="h-full flex flex-col bg-slate-900">
        <div className="p-4 border-b border-slate-700 bg-slate-800">
          <h2 className="text-lg font-bold text-white">RAG Assistant</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-6">
            <h3 className="text-red-400 font-semibold mb-2">Error Loading Context</h3>
            <p className="text-red-300">{itemsError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">RAG Assistant</h2>
            <p className="text-slate-400 text-sm">Ask questions about your codebase using natural language</p>
          </div>
          {isDemoMode && (
            <div className="text-right">
              <span className="bg-amber-900/20 border border-amber-700/30 text-amber-400 text-xs px-2 py-1 rounded flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                Demo Context
              </span>
              <p className="text-amber-600 text-xs mt-1">Chat may be unavailable</p>
            </div>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3xl rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white ml-8'
                  : 'bg-slate-800 text-slate-200 mr-8 border border-slate-700'
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{message.text}</div>
              
              {/* Context Display */}
              {message.retrievedContext && message.retrievedContext.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <div className="text-xs text-slate-400 mb-2">📚 Context used ({message.retrievedContext.length} items):</div>
                  <div className="space-y-1">
                    {message.retrievedContext.map((item) => (
                      <div key={item.id} className="text-xs bg-slate-900/50 px-2 py-1 rounded border border-slate-600">
                        <span className="text-slate-300 font-mono">{item.id}</span>
                        <span className="text-slate-500 ml-2">({item.type}, {item.language})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-3xl bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 mr-8">
              <div className="flex items-center gap-2 text-slate-400">
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <span className="ml-2">Analyzing codebase...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-700 bg-slate-800">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your codebase..."
            disabled={isLoading || itemsLoading}
            className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
          <button 
            type="submit"
            disabled={isLoading || !input.trim() || itemsLoading}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-6 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Thinking...
              </>
            ) : (
              'Send'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;