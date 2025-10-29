import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { cn } from '@/lib/utils';
import { useThemeDetector } from '@/hooks/useThemeDetector';

interface MermaidProps {
  chart: string;
  className?: string;
}

let mermaidIdCounter = 0;

// Theme configurations for Mermaid
const getMermaidTheme = (isDark: boolean) => {
  if (isDark) {
    return {
      theme: 'dark' as const,
      themeVariables: {
        // Dark mode colors - using Tailwind slate palette
        primaryColor: '#1e293b',
        primaryTextColor: '#f1f5f9',
        primaryBorderColor: '#475569',
        lineColor: '#94a3b8',
        secondaryColor: '#334155',
        tertiaryColor: '#0f172a',
        background: '#0f172a',
        mainBkg: '#1e293b',
        secondBkg: '#334155',
        tertiaryBkg: '#0f172a',
        textColor: '#f1f5f9',
        border1: '#475569',
        border2: '#64748b',
        // Flowchart specific
        nodeBorder: '#64748b',
        clusterBkg: '#1e293b',
        clusterBorder: '#475569',
        // Sequence diagram
        actorBorder: '#64748b',
        actorBkg: '#1e293b',
        actorTextColor: '#f1f5f9',
        actorLineColor: '#94a3b8',
        signalColor: '#f1f5f9',
        signalTextColor: '#f1f5f9',
        labelBoxBkgColor: '#1e293b',
        labelBoxBorderColor: '#64748b',
        labelTextColor: '#f1f5f9',
        loopTextColor: '#f1f5f9',
        noteBorderColor: '#64748b',
        noteBkgColor: '#334155',
        noteTextColor: '#f1f5f9',
        activationBorderColor: '#64748b',
        activationBkgColor: '#334155',
        // Gantt chart
        sectionBkgColor: '#1e293b',
        altSectionBkgColor: '#334155',
        sectionBkgColor2: '#0f172a',
        excludeBkgColor: '#475569',
        taskBorderColor: '#64748b',
        taskBkgColor: '#334155',
        taskTextColor: '#f1f5f9',
        taskTextOutsideColor: '#f1f5f9',
        activeTaskBorderColor: '#94a3b8',
        activeTaskBkgColor: '#475569',
        gridColor: '#475569',
        doneTaskBkgColor: '#059669',
        doneTaskBorderColor: '#10b981',
        critBkgColor: '#dc2626',
        critBorderColor: '#ef4444',
        todayLineColor: '#3b82f6',
        // Git graph
        git0: '#3b82f6',
        git1: '#10b981',
        git2: '#f59e0b',
        git3: '#ef4444',
        git4: '#8b5cf6',
        git5: '#ec4899',
        git6: '#06b6d4',
        git7: '#84cc16',
        gitBranchLabel0: '#f1f5f9',
        gitBranchLabel1: '#f1f5f9',
        gitBranchLabel2: '#f1f5f9',
        commitLabelColor: '#f1f5f9',
        commitLabelBackground: '#1e293b',
      }
    };
  }

  // Light mode - using Tailwind slate palette
  return {
    theme: 'default' as const,
    themeVariables: {
      primaryColor: '#f0f9ff',
      primaryTextColor: '#0f172a',
      primaryBorderColor: '#cbd5e1',
      lineColor: '#64748b',
      secondaryColor: '#f8fafc',
      tertiaryColor: '#ffffff',
      background: '#ffffff',
      mainBkg: '#f8fafc',
      secondBkg: '#f0f9ff',
      textColor: '#0f172a',
      border1: '#cbd5e1',
      border2: '#94a3b8',
      // Flowchart specific
      nodeBorder: '#94a3b8',
      clusterBkg: '#f8fafc',
      clusterBorder: '#cbd5e1',
      // Sequence diagram
      actorBorder: '#94a3b8',
      actorBkg: '#f8fafc',
      actorTextColor: '#0f172a',
      actorLineColor: '#64748b',
      signalColor: '#0f172a',
      signalTextColor: '#0f172a',
      labelBoxBkgColor: '#f0f9ff',
      labelBoxBorderColor: '#94a3b8',
      labelTextColor: '#0f172a',
      loopTextColor: '#0f172a',
      noteBorderColor: '#94a3b8',
      noteBkgColor: '#fef3c7',
      noteTextColor: '#0f172a',
      activationBorderColor: '#94a3b8',
      activationBkgColor: '#f0f9ff',
      // Gantt chart
      sectionBkgColor: '#f8fafc',
      altSectionBkgColor: '#ffffff',
      sectionBkgColor2: '#f0f9ff',
      excludeBkgColor: '#e2e8f0',
      taskBorderColor: '#94a3b8',
      taskBkgColor: '#f0f9ff',
      taskTextColor: '#0f172a',
      taskTextOutsideColor: '#0f172a',
      activeTaskBorderColor: '#64748b',
      activeTaskBkgColor: '#cbd5e1',
      gridColor: '#cbd5e1',
      doneTaskBkgColor: '#86efac',
      doneTaskBorderColor: '#22c55e',
      critBkgColor: '#fca5a5',
      critBorderColor: '#ef4444',
      todayLineColor: '#3b82f6',
      // Git graph
      git0: '#3b82f6',
      git1: '#22c55e',
      git2: '#f59e0b',
      git3: '#ef4444',
      git4: '#8b5cf6',
      git5: '#ec4899',
      git6: '#06b6d4',
      git7: '#84cc16',
      gitBranchLabel0: '#0f172a',
      gitBranchLabel1: '#0f172a',
      gitBranchLabel2: '#0f172a',
      commitLabelColor: '#0f172a',
      commitLabelBackground: '#f8fafc',
    }
  };
};

export const Mermaid = ({ chart, className }: MermaidProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [mermaidId] = useState(() => `mermaid-${++mermaidIdCounter}`);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Detect current theme (light or dark)
  const theme = useThemeDetector();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (chart.trim()) {
      setIsLoading(true);
      setError('');
      setSvgContent('');

      const themeConfig = getMermaidTheme(isDark);

      mermaid.initialize({
        startOnLoad: false,
        ...themeConfig,
        securityLevel: 'loose',
        fontFamily: 'inherit',
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
  }, [chart, mermaidId, isDark]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-24 text-sm text-muted-foreground", className)}>
        Rendering diagram...
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(
        "text-sm p-3 rounded border",
        isDark
          ? "text-red-400 bg-red-950/30 border-red-900/50"
          : "text-red-600 bg-red-50 border-red-200",
        className
      )}>
        <strong>Mermaid Error:</strong> {error}
        <pre className={cn(
          "mt-2 text-xs overflow-x-auto",
          isDark ? "text-red-300" : "text-red-700"
        )}>{chart}</pre>
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
