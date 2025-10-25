import { Loader2, Shield, AlertTriangle, XCircle } from 'lucide-react';
import type { AISecurityAnalysis } from '@/constants/mcpSecurity';
import { cn } from '@/lib/utils';

interface AISecurityPanelProps {
  analysis: AISecurityAnalysis;
}

export function AISecurityPanel({ analysis }: AISecurityPanelProps) {
  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'low':
        return 'text-green-600 dark:text-green-400';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'high':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getRiskIcon = (risk?: string) => {
    switch (risk) {
      case 'low':
        return Shield;
      case 'medium':
        return AlertTriangle;
      case 'high':
        return XCircle;
      default:
        return Shield;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">AI Security Analysis</h3>
        {analysis.isAnalyzing && (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Analyzing...
          </span>
        )}
      </div>

      <div className="bg-muted/50 rounded-lg p-4 border border-border space-y-3">
        {analysis.isAnalyzing && (
          <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Running security analysis...
          </div>
        )}

        {analysis.error && (
          <div className="text-sm text-muted-foreground">
            <p className="text-yellow-600 dark:text-yellow-400">
              AI analysis unavailable: {analysis.error}
            </p>
            <p className="mt-2">Proceeding with manual validation only.</p>
          </div>
        )}

        {analysis.isComplete && analysis.analysis && (
          <>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {analysis.analysis}
            </p>

            {analysis.riskLevel && (
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                {(() => {
                  const Icon = getRiskIcon(analysis.riskLevel);
                  return <Icon className={cn('w-4 h-4', getRiskColor(analysis.riskLevel))} />;
                })()}
                <span className="text-sm font-medium">
                  Risk Level:{' '}
                  <span className={cn('uppercase', getRiskColor(analysis.riskLevel))}>
                    {analysis.riskLevel}
                  </span>
                </span>
              </div>
            )}

            {analysis.recommendations && analysis.recommendations.length > 0 && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Recommendations:
                </p>
                <ul className="space-y-1 text-sm text-foreground">
                  {analysis.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
