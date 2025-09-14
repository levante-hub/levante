import React, { createContext, useContext, useState, useCallback } from 'react';

interface StreamingContextType {
  streamFinished: number;
  triggerMermaidProcessing: () => void;
}

const StreamingContext = createContext<StreamingContextType | undefined>(undefined);

export function StreamingProvider({ children }: { children: React.ReactNode }) {
  const [streamFinished, setStreamFinished] = useState(0);

  const triggerMermaidProcessing = useCallback(() => {
    setStreamFinished(prev => prev + 1);
  }, []);

  return (
    <StreamingContext.Provider value={{ streamFinished, triggerMermaidProcessing }}>
      {children}
    </StreamingContext.Provider>
  );
}

export function useStreamingContext() {
  const context = useContext(StreamingContext);
  if (context === undefined) {
    throw new Error('useStreamingContext must be used within a StreamingProvider');
  }
  return context;
}