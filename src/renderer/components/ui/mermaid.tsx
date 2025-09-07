import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { cn } from '@/lib/utils';

interface MermaidProps {
  chart: string;
  className?: string;
}

let mermaidIdCounter = 0;

export const Mermaid = ({ chart, className }: MermaidProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [mermaidId] = useState(() => `mermaid-${++mermaidIdCounter}`);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (chart.trim()) {
      setIsLoading(true);
      setError('');
      setSvgContent('');
      
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'loose',
        fontFamily: 'inherit',
        themeVariables: {
          primaryColor: '#ffffff',
          primaryTextColor: '#000000',
          primaryBorderColor: '#cccccc',
          lineColor: '#666666',
          sectionBkgColor: '#f9f9f9',
          altSectionBkgColor: '#ffffff',
          gridColor: '#e0e0e0',
          tertiaryColor: '#f0f0f0'
        }
      });
      
      mermaid.render(mermaidId, chart).then((result) => {
        setSvgContent(result.svg);
        setIsLoading(false);
      }).catch((error) => {
        console.error('Mermaid rendering error:', error);
        setError(error.message || 'Failed to render diagram');
        setIsLoading(false);
      });
    }
  }, [chart, mermaidId]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-24 text-sm text-muted-foreground", className)}>
        Rendering diagram...
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200", className)}>
        <strong>Mermaid Error:</strong> {error}
        <pre className="mt-2 text-xs">{chart}</pre>
      </div>
    );
  }

  return (
    <div 
      ref={ref} 
      className={cn("mermaid-container", className)} 
      style={{ minHeight: '100px' }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};