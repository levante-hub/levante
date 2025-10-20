import { Brain, FileText, Globe, Terminal, Shield, Eye } from 'lucide-react';

export function McpStep() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          What is MCP (Model Context Protocol)?
        </h2>
        <p className="mt-2 text-muted-foreground">
          MCP lets AI models interact with your tools and data—with your explicit permission.
        </p>
      </div>

      <div className="mt-8 space-y-6">
        <div className="rounded-lg border bg-muted/50 p-6">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-2 border">
              <Brain className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">AI Model</span>
            </div>
            <div className="flex-shrink-0">
              <svg className="h-6 w-12" fill="none" stroke="currentColor" viewBox="0 0 48 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12h44M40 6l6 6-6 6" />
              </svg>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-2 border">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">MCP Tools</span>
            </div>
            <div className="flex-shrink-0">
              <svg className="h-6 w-12" fill="none" stroke="currentColor" viewBox="0 0 48 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12h44M40 6l6 6-6 6" />
              </svg>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-2 border">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Your Data</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Examples of what MCP can do:</h3>
          <div className="grid gap-3">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <span className="text-sm">Read files from your computer</span>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Globe className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <span className="text-sm">Search the web for current information</span>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Terminal className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <span className="text-sm">Execute commands (with your permission)</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-primary/50 bg-primary/5 p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4" />
            You're always in control:
          </h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>• One-click consent for each tool</li>
            <li>• Complete audit trail of actions</li>
            <li>• Sandboxed execution for safety</li>
          </ul>
        </div>

        <p className="text-center text-sm text-muted-foreground italic">
          Levante was built to make MCP accessible and transparent.
        </p>
      </div>
    </div>
  );
}
