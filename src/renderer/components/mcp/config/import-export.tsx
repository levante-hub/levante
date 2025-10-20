import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Download, 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle,
  Info,
  Settings
} from 'lucide-react';
import { useMCPStore } from '@/stores/mcpStore';
import { toast } from 'sonner';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

interface ImportExportProps {
  variant?: 'buttons' | 'dropdown';
}

export function ImportExport({ variant = 'dropdown' }: ImportExportProps) {
  const { exportConfiguration, importConfiguration, activeServers } = useMCPStore();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const config = await exportConfiguration();
      
      if (!config) {
        throw new Error('No configuration to export');
      }

      // Create download
      const blob = new Blob([JSON.stringify(config, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `levante-mcp-config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Configuration exported successfully!');
    } catch (error) {
      logger.mcp.error('MCP configuration export failed', { error: error instanceof Error ? error.message : error });
      toast.error('Failed to export configuration');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportError(null);
    
    try {
      const content = await file.text();
      const config = JSON.parse(content);
      
      // Validate configuration structure
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        throw new Error('Invalid configuration format: missing or invalid mcpServers');
      }

      setImportPreview(config);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to parse configuration file');
      setImportPreview(null);
    }
  };

  const handleImport = async () => {
    if (!importPreview) return;

    setIsImporting(true);
    
    try {
      await importConfiguration(importPreview);
      toast.success('Configuration imported successfully!');
      handleCloseImportDialog();
    } catch (error) {
      logger.mcp.error('MCP configuration import failed', { serverCount: getImportServerCount(), error: error instanceof Error ? error.message : error });
      toast.error('Failed to import configuration');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCloseImportDialog = () => {
    setShowImportDialog(false);
    setImportFile(null);
    setImportPreview(null);
    setImportError(null);
  };

  const getImportServerCount = () => {
    if (!importPreview) return 0;
    return Object.keys(importPreview.mcpServers).length;
  };

  const getConflictingServers = () => {
    if (!importPreview) return [];
    const importServerIds = Object.keys(importPreview.mcpServers);
    const activeServerIds = activeServers.map(s => s.id);
    return importServerIds.filter(id => activeServerIds.includes(id));
  };

  if (variant === 'dropdown') {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Settings className="w-4 h-4" />
              Config
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={handleExport}
              disabled={isExporting || activeServers.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export Config'}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setShowImportDialog(true)}
              disabled={isImporting}
            >
              <Upload className="w-4 h-4 mr-2" />
              Import Config
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Import Dialog */}
        <Dialog open={showImportDialog} onOpenChange={handleCloseImportDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Import MCP Configuration
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* File Selection */}
              <div className="space-y-2">
                <Label htmlFor="config-file">Configuration File</Label>
                <Input
                  id="config-file"
                  type="file"
                  accept=".json"
                  onChange={handleImportFileSelect}
                />
              </div>

              {/* Error Display */}
              {importError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Import Error</AlertTitle>
                  <AlertDescription>{importError}</AlertDescription>
                </Alert>
              )}

              {/* Preview */}
              {importPreview && (
                <div className="space-y-3">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Import Preview</AlertTitle>
                    <AlertDescription>
                      This configuration contains <strong>{getImportServerCount()} server(s)</strong>.
                    </AlertDescription>
                  </Alert>

                  {/* Conflict Warning */}
                  {getConflictingServers().length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Configuration Conflicts</AlertTitle>
                      <AlertDescription>
                        The following servers will be overwritten: {getConflictingServers().join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Server List */}
                  <div className="max-h-32 overflow-y-auto bg-muted p-3 rounded-md">
                    <h4 className="text-sm font-medium mb-2">Servers to import:</h4>
                    <ul className="text-xs space-y-1">
                      {Object.keys(importPreview.mcpServers).map(serverId => (
                        <li key={serverId} className="flex items-center gap-2">
                          <FileText className="w-3 h-3" />
                          {serverId}
                          {getConflictingServers().includes(serverId) && (
                            <span className="text-red-500">(will overwrite)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleCloseImportDialog}>
                Cancel
              </Button>
              <Button 
                onClick={handleImport}
                disabled={!importPreview || isImporting}
              >
                {isImporting ? (
                  <>
                    <Upload className="w-4 h-4 animate-pulse mr-2" />
                    Importing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (variant === 'buttons') {
    return (
      <>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleExport}
            disabled={isExporting || activeServers.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export Config'}
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => setShowImportDialog(true)}
            disabled={isImporting}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import Config
          </Button>
        </div>

        {/* Import Dialog */}
        <Dialog open={showImportDialog} onOpenChange={handleCloseImportDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Import MCP Configuration
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* File Selection */}
              <div className="space-y-2">
                <Label htmlFor="config-file">Configuration File</Label>
                <Input
                  id="config-file"
                  type="file"
                  accept=".json"
                  onChange={handleImportFileSelect}
                />
              </div>

              {/* Error Display */}
              {importError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Import Error</AlertTitle>
                  <AlertDescription>{importError}</AlertDescription>
                </Alert>
              )}

              {/* Preview */}
              {importPreview && (
                <div className="space-y-3">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Import Preview</AlertTitle>
                    <AlertDescription>
                      This configuration contains <strong>{getImportServerCount()} server(s)</strong>.
                    </AlertDescription>
                  </Alert>

                  {/* Conflict Warning */}
                  {getConflictingServers().length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Configuration Conflicts</AlertTitle>
                      <AlertDescription>
                        The following servers will be overwritten: {getConflictingServers().join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Server List */}
                  <div className="max-h-32 overflow-y-auto bg-muted p-3 rounded-md">
                    <h4 className="text-sm font-medium mb-2">Servers to import:</h4>
                    <ul className="text-xs space-y-1">
                      {Object.keys(importPreview.mcpServers).map(serverId => (
                        <li key={serverId} className="flex items-center gap-2">
                          <FileText className="w-3 h-3" />
                          {serverId}
                          {getConflictingServers().includes(serverId) && (
                            <span className="text-red-500">(will overwrite)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleCloseImportDialog}>
                Cancel
              </Button>
              <Button 
                onClick={handleImport}
                disabled={!importPreview || isImporting}
              >
                {isImporting ? (
                  <>
                    <Upload className="w-4 h-4 animate-pulse mr-2" />
                    Importing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // TODO: Implement dropdown variant for Phase 4
  return null;
}