import React, { createContext, useContext, ReactNode, useState } from 'react';
import { ApiClient } from '../../services/apiClient';

export interface AiItemContextValue {
  apiClient: ApiClient;
  baseUrl: string;
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  setBaseUrl: (url: string) => void;
}

const AiItemContext = createContext<AiItemContextValue | null>(null);

export interface AiItemProviderProps {
  children: ReactNode;
  baseUrl?: string;
  demoMode?: boolean;
}

export const AiItemProvider: React.FC<AiItemProviderProps> = ({
  children,
  baseUrl = '',
  demoMode = false
}) => {
  const [currentBaseUrl, setCurrentBaseUrl] = useState(baseUrl);
  const [currentDemoMode, setCurrentDemoMode] = useState(demoMode);
  const [apiClient] = useState(() => new ApiClient(currentBaseUrl, currentDemoMode));

  const setDemoMode = (enabled: boolean) => {
    setCurrentDemoMode(enabled);
    apiClient.setDemoMode(enabled);
  };

  const setBaseUrl = (url: string) => {
    setCurrentBaseUrl(url);
    // Note: ApiClient doesn't have a setBaseUrl method, so we'd need to create a new instance
    // For now, this would require reinitializing the client
  };

  const value: AiItemContextValue = {
    apiClient,
    baseUrl: currentBaseUrl,
    isDemoMode: currentDemoMode,
    setDemoMode,
    setBaseUrl,
  };

  return (
    <AiItemContext.Provider value={value}>
      {children}
    </AiItemContext.Provider>
  );
};

export const useAiItemContext = (): AiItemContextValue => {
  const context = useContext(AiItemContext);
  if (!context) {
    throw new Error('useAiItemContext must be used within an AiItemProvider');
  }
  return context;
};
