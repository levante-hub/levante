import { Brain, FileText, Globe, Terminal, Shield, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function McpStep() {
  const { t } = useTranslation('wizard');

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-bold tracking-tight">
          {t('mcp.title')}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t('mcp.subtitle')}
        </p>
      </div>

      <div className="mt-4 space-y-4">
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center justify-center gap-2.5">
            <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-1.5 border">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">{t('mcp.diagram.ai_model')}</span>
            </div>
            <div className="flex-shrink-0">
              <svg className="h-5 w-10" fill="none" stroke="currentColor" viewBox="0 0 48 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12h44M40 6l6 6-6 6" />
              </svg>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-1.5 border">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">{t('mcp.diagram.mcp_tools')}</span>
            </div>
            <div className="flex-shrink-0">
              <svg className="h-5 w-10" fill="none" stroke="currentColor" viewBox="0 0 48 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12h44M40 6l6 6-6 6" />
              </svg>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-1.5 border">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">{t('mcp.diagram.your_data')}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">{t('mcp.examples.title')}</h3>
            <div className="grid gap-2">
              <div className="flex items-start gap-2 rounded-lg border p-2">
                <FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-xs">{t('mcp.examples.read_files')}</span>
              </div>
              <div className="flex items-start gap-2 rounded-lg border p-2">
                <Globe className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-xs">{t('mcp.examples.web_search')}</span>
              </div>
              <div className="flex items-start gap-2 rounded-lg border p-2">
                <Terminal className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-xs">{t('mcp.examples.execute_commands')}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-primary/50 bg-primary/5 p-3">
            <h3 className="font-semibold flex items-center gap-2 mb-2 text-sm">
              <Eye className="h-3.5 w-3.5" />
              {t('mcp.control.title')}
            </h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• {t('mcp.control.consent')}</li>
              <li>• {t('mcp.control.audit_trail')}</li>
              <li>• {t('mcp.control.sandboxed')}</li>
            </ul>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground italic pt-1">
          {t('mcp.footer')}
        </p>
      </div>
    </div>
  );
}
