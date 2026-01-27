import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, Terminal, Globe, Server, Check, Box } from 'lucide-react';
import { MCPRegistryEntry } from '@/types/mcp';
import { useTranslation } from 'react-i18next';

interface MCPInfoSheetProps {
  entry: MCPRegistryEntry | null;
  isOpen: boolean;
  isInstalled: boolean;
  onClose: () => void;
  onInstall?: () => void;
}

export function MCPInfoSheet({
  entry,
  isOpen,
  isInstalled,
  onClose,
  onInstall
}: MCPInfoSheetProps) {
  const { t } = useTranslation('mcp');
  const [logoError, setLogoError] = useState(false);

  if (!entry) return null;

  const displayName = entry.displayName || entry.name;
  const template = entry.configuration?.template;
  const transportType = template?.type || entry.transport?.type || 'stdio';
  const isHttpBased = transportType === 'http' || transportType === 'sse' || transportType === 'streamable-http';

  // Get command or URL display
  const getCommandDisplay = () => {
    if (transportType === 'stdio') {
      const command = template?.command || 'N/A';
      const args = template?.args?.join(' ') || '';
      return `${command} ${args}`.trim();
    }
    // For HTTP-based transports, prefer 'url' over 'baseUrl' (legacy)
    return template?.url || template?.baseUrl || 'N/A';
  };

  // Get environment variables (for stdio)
  const envVars = template?.env || {};
  const hasEnvVars = Object.keys(envVars).length > 0;

  // Get headers (for HTTP-based transports)
  const headers = template?.headers || {};
  const hasHeaders = Object.keys(headers).length > 0;

  // Get required input fields from configuration (for any transport)
  const requiredFields = entry.configuration?.fields?.filter(f => f.required) || [];
  const hasRequiredFields = requiredFields.length > 0;

  // Transport icon
  const TransportIcon = transportType === 'stdio' ? Terminal : isHttpBased ? Globe : Server;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader className="space-y-3">
          <div className="flex items-start gap-4">
            {/* Logo */}
            <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-muted flex items-center justify-center overflow-hidden border">
              {entry.logoUrl && !logoError ? (
                <img
                  src={entry.logoUrl}
                  alt={`${displayName} logo`}
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : entry.icon ? (
                <span className="text-2xl">{entry.icon}</span>
              ) : (
                <Box className="w-7 h-7 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <SheetTitle className="text-2xl">{displayName}</SheetTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary">{entry.category}</Badge>
                {entry.source && (
                  <Badge variant={entry.source === 'official' ? 'default' : 'secondary'}>
                    {entry.source === 'official' ? 'Official' : 'Community'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <SheetDescription className="text-base text-foreground/80">
            {entry.description}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Transport Section */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TransportIcon className="w-4 h-4" />
              {t('info.transport_title')}
            </h3>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3 border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('info.transport_type')}
                </span>
                <Badge variant="outline" className="font-mono">
                  {transportType}
                </Badge>
              </div>

              <Separator />

              <div className="space-y-2">
                <span className="text-sm text-muted-foreground block">
                  {transportType === 'stdio' ? t('info.command_title') : t('info.url_title')}
                </span>
                <code className="block text-sm bg-background/50 p-3 rounded border font-mono break-all">
                  {getCommandDisplay()}
                </code>
              </div>

              {transportType === 'stdio' && template?.args && template.args.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <span className="text-sm text-muted-foreground block">
                      {t('info.args_title')}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {template.args.map((arg, idx) => (
                        <Badge key={idx} variant="secondary" className="font-mono">
                          {arg}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Required Inputs / Configuration Fields */}
          {hasRequiredFields && (
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t('info.required_inputs_title')}
              </h3>
              <div className="bg-muted/50 rounded-lg p-4 space-y-3 border">
                {requiredFields.map((field) => (
                  <div key={field.key} className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono">{field.key}</code>
                        <Badge variant="outline" className="text-xs">
                          {field.type}
                        </Badge>
                        {field.required && (
                          <Badge variant="destructive" className="text-xs">
                            {t('info.env_required')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {field.description || field.label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Headers (for HTTP-based transports) */}
          {isHttpBased && hasHeaders && (
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t('info.headers_title')}
              </h3>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 border">
                {Object.entries(headers).map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <code className="text-sm font-mono">{key}</code>
                      <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                        {value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Environment Variables (for stdio) */}
          {transportType === 'stdio' && (
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t('info.env_title')}
              </h3>
              {hasEnvVars ? (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2 border">
                  {Object.entries(envVars).map(([key, value]) => {
                    const field = requiredFields.find(f => f.key === key);
                    const isRequired = field?.required ?? false;

                    return (
                      <div key={key} className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono">{key}</code>
                            {isRequired && (
                              <Badge variant="destructive" className="text-xs">
                                {t('info.env_required')}
                              </Badge>
                            )}
                          </div>
                          {field?.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {field.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !hasRequiredFields && (
                <p className="text-sm text-muted-foreground italic">
                  {t('info.no_env')}
                </p>
              )}
            </div>
          )}

          {/* No configuration required message (only for HTTP-based transports without config) */}
          {isHttpBased && !hasRequiredFields && !hasHeaders && (
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t('info.configuration_title', { defaultValue: 'Configuration' })}
              </h3>
              <p className="text-sm text-muted-foreground italic">
                {t('info.no_config', { defaultValue: 'No configuration required' })}
              </p>
            </div>
          )}

          {/* Maintainer Section */}
          {entry.maintainer && (
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t('info.maintainer_title')}
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('info.maintainer_name')}</span>
                  <span className="font-medium">{entry.maintainer.name}</span>
                </div>

                {entry.maintainer.url && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('info.maintainer_url')}</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => window.levante.openExternal(entry.maintainer!.url!)}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Link
                    </Button>
                  </div>
                )}

                {entry.maintainer.github && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">GitHub</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => window.levante.openExternal(`https://github.com/${entry.maintainer!.github}`)}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      @{entry.maintainer.github}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metadata Section */}
          {entry.metadata && (
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {t('info.metadata_title')}
              </h3>
              <div className="space-y-2">
                {entry.metadata.author && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('info.author')}</span>
                    <span className="font-medium">{entry.metadata.author}</span>
                  </div>
                )}

                {entry.metadata.homepage && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('info.homepage')}</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => window.levante.openExternal(entry.metadata!.homepage!)}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Link
                    </Button>
                  </div>
                )}

                {entry.metadata.repository && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('info.repository')}</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => window.levante.openExternal(entry.metadata!.repository!)}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      GitHub
                    </Button>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>

        {/* Footer with Install Button */}
        <div className="mt-8 pt-6 border-t">
          <Button
            className="w-full"
            size="lg"
            onClick={onInstall}
            disabled={isInstalled}
          >
            {isInstalled ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                {t('info.already_installed')}
              </>
            ) : (
              t('info.install')
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
