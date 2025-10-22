import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

interface DirectoryInfo {
  baseDir: string;
  exists: boolean;
  files: string[];
  totalFiles: number;
  filesWithStats: Array<{
    name: string;
    size: number;
    modified: string | null;
  }>;
  paths: {
    database: string;
    preferences: string;
    mcpConfig: string;
    logs: string;
    memory: string;
    userProfile: string;
  };
}

interface ServiceHealth {
  database: {
    initialized: boolean;
    path: string;
    healthy: boolean;
  };
  preferences: {
    path: string;
    size: number;
  };
  directory: {
    baseDir: string;
    exists: boolean;
  };
}

export function DebugPanel() {
  const [directoryInfo, setDirectoryInfo] = useState<DirectoryInfo | null>(null);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectoryInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.levante.debug.directoryInfo();
      if (response.success) {
        setDirectoryInfo(response.data);
      } else {
        setError(response.error || 'Failed to load directory info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const loadServiceHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.levante.debug.serviceHealth();
      if (response.success) {
        setServiceHealth(response.data);
      } else {
        setError(response.error || 'Failed to load service health');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const loadFileList = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await window.levante.debug.listFiles();
      if (response.success && response.data) {
        setFiles(response.data);
      } else {
        setError(response.error || 'Failed to load file list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold">Debug Panel</h1>
        <Badge variant="outline">DirectoryService</Badge>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50 border-none">
          <CardContent className="p-4">
            <p className="text-red-700">Error: {error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-none">
          <CardHeader>
            <CardTitle>Directory Info</CardTitle>
            <CardDescription>Levante directory structure</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={loadDirectoryInfo} disabled={loading}>
              {loading ? 'Loading...' : 'Load Directory Info'}
            </Button>
            {directoryInfo && (
              <div className="mt-4 space-y-2">
                <p><strong>Base:</strong> {directoryInfo.baseDir}</p>
                <p><strong>Files:</strong> {directoryInfo.totalFiles}</p>
                <p><strong>Exists:</strong> 
                  <Badge variant={directoryInfo.exists ? "default" : "destructive"}>
                    {directoryInfo.exists ? 'Yes' : 'No'}
                  </Badge>
                </p>
                <ScrollArea className="h-32 w-full border rounded p-2">
                  {directoryInfo.filesWithStats.map(file => (
                    <div key={file.name} className="text-sm flex justify-between">
                      <span>{file.name}</span>
                      <span className="text-gray-500">{formatBytes(file.size)}</span>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none">
          <CardHeader>
            <CardTitle>Service Health</CardTitle>
            <CardDescription>Service status and paths</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={loadServiceHealth} disabled={loading}>
              {loading ? 'Loading...' : 'Check Health'}
            </Button>
            {serviceHealth && (
              <div className="mt-4 space-y-2">
                <div>
                  <strong>Database:</strong>
                  <Badge variant={serviceHealth.database.healthy ? "default" : "destructive"}>
                    {serviceHealth.database.healthy ? 'Healthy' : 'Unhealthy'}
                  </Badge>
                </div>
                <div>
                  <strong>Preferences:</strong> {formatBytes(serviceHealth.preferences.size)}
                </div>
                <div>
                  <strong>Directory:</strong>
                  <Badge variant={serviceHealth.directory.exists ? "default" : "destructive"}>
                    {serviceHealth.directory.exists ? 'Exists' : 'Missing'}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none">
          <CardHeader>
            <CardTitle>File List</CardTitle>
            <CardDescription>All files in directory</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={loadFileList} disabled={loading}>
              {loading ? 'Loading...' : 'List Files'}
            </Button>
            {files.length > 0 && (
              <ScrollArea className="h-32 w-full border rounded p-2 mt-4">
                {files.map(file => (
                  <div key={file} className="text-sm">
                    {file}
                  </div>
                ))}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {directoryInfo && (
        <Card className="border-none">
          <CardHeader>
            <CardTitle>File Paths</CardTitle>
            <CardDescription>Predefined file locations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div><strong>Database:</strong> {directoryInfo.paths.database}</div>
              <div><strong>Preferences:</strong> {directoryInfo.paths.preferences}</div>
              <div><strong>MCP Config:</strong> {directoryInfo.paths.mcpConfig}</div>
              <div><strong>Logs:</strong> {directoryInfo.paths.logs}</div>
              <div><strong>Memory:</strong> {directoryInfo.paths.memory}</div>
              <div><strong>User Profile:</strong> {directoryInfo.paths.userProfile}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}