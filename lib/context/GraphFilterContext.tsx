import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface GraphFilterContextValue {
  filteredItemIds: Set<string>;
  setFilteredItemIds: (ids: Set<string>) => void;
}

const GraphFilterContext = createContext<GraphFilterContextValue | null>(null);

export interface GraphFilterProviderProps {
  children: ReactNode;
}

export const GraphFilterProvider: React.FC<GraphFilterProviderProps> = ({ children }) => {
  const [filteredItemIds, setFilteredItemIds] = useState<Set<string>>(new Set());

  const value: GraphFilterContextValue = {
    filteredItemIds,
    setFilteredItemIds,
  };

  return (
    <GraphFilterContext.Provider value={value}>
      {children}
    </GraphFilterContext.Provider>
  );
};

export const useGraphFilter = (): GraphFilterContextValue => {
  const context = useContext(GraphFilterContext);
  if (!context) {
    throw new Error('useGraphFilter must be used within a GraphFilterProvider');
  }
  return context;
};