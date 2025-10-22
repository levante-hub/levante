import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Folder, Database, Settings, FileText, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function DirectoryStep() {
  const { t } = useTranslation('wizard');
  const [directoryPath, setDirectoryPath] = useState('');
  const [directoryInfo, setDirectoryInfo] = useState<{
    exists: boolean;
    totalFiles: number;
  } | null>(null);

  useEffect(() => {
    loadDirectoryInfo();
  }, []);

  const loadDirectoryInfo = async () => {
    try {
      const result = await window.levante.profile.getDirectoryInfo();
      if (result.success && result.data) {
        setDirectoryPath(result.data.baseDir);
        setDirectoryInfo({
          exists: result.data.exists,
          totalFiles: result.data.totalFiles,
        });
      }
    } catch (error) {
      console.error('Failed to load directory info:', error);
    }
  };

  const handleOpenDirectory = async () => {
    try {
      await window.levante.profile.openDirectory();
    } catch (error) {
      console.error('Failed to open directory:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          {t('directory.title')}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {t('directory.subtitle')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Folder className="h-5 w-5 text-primary" />
            <code className="text-sm font-mono">{directoryPath || '~/levante/'}</code>
          </div>

          <div className="space-y-2 ml-7">
            <div className="flex items-start gap-2 text-sm">
              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className="font-mono text-xs">user-profile.json</span>
                <span className="text-muted-foreground"> - {t('directory.files.user_profile')}</span>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Settings className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className="font-mono text-xs">ui-preferences.json</span>
                <span className="text-muted-foreground"> - {t('directory.files.ui_preferences')}</span>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Database className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className="font-mono text-xs">levante.db</span>
                <span className="text-muted-foreground"> - {t('directory.files.chat_history')}</span>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Folder className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <span className="font-mono text-xs">mcp-servers/</span>
                <span className="text-muted-foreground"> - {t('directory.files.mcp_servers')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold text-sm">{t('directory.why_title')}</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>{t('directory.reasons.easy_access')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>{t('directory.reasons.simple_backup')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              <span>{t('directory.reasons.portable')}</span>
            </li>
          </ul>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription dangerouslySetInnerHTML={{ __html: t('directory.privacy_guarantee') }} />
        </Alert>

        {directoryInfo && directoryInfo.exists && (
          <div className="flex items-center justify-center pt-2">
            <Button
              variant="outline"
              onClick={handleOpenDirectory}
              className="gap-2"
            >
              <Folder className="h-4 w-4" />
              {t('directory.open_button')}
            </Button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pt-2">
          {t('directory.tip')}
        </p>
      </div>
    </div>
  );
}
