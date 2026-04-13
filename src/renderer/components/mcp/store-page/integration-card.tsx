import React from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Settings,
  Trash2,
  Loader2,
  Info,
  CheckCircle,
  Users,
  AlertTriangle,
  FlaskConical,
  Square
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MCPRegistryEntry, MCPServerConfig, MCPConnectionStatus } from '@/types/mcp';
import { ConnectionStatus } from '../connection/connection-status';
import { useTranslation } from 'react-i18next';
import { useMCPStore } from '@/stores/mcpStore';

interface IntegrationCardProps {
  mode: 'active' | 'store';
  entry?: MCPRegistryEntry;
  server?: MCPServerConfig;
  status: MCPConnectionStatus;
  isActive: boolean;
  isInstalling?: boolean;
  onToggle: () => void;
  onConfigure: () => void;
  onAddToActive?: () => void;
  onDelete?: () => void;
  onShowInfo?: () => void;
}

// Source badge configuration
const SOURCE_CONFIG = {
  official: { icon: CheckCircle, label: 'Official', variant: 'default' as const },
  community: { icon: Users, label: 'Community', variant: 'secondary' as const }
};

// Status badge configuration (only show non-active statuses)
const STATUS_CONFIG = {
  deprecated: { icon: AlertTriangle, label: 'Deprecated', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  experimental: { icon: FlaskConical, label: 'Experimental', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' }
};

export function IntegrationCard({
  mode,
  entry,
  server,
  status,
  isActive,
  isInstalling = false,
  onToggle,
  onConfigure,
  onAddToActive,
  onDelete,
  onShowInfo
}: IntegrationCardProps) {
  const { t } = useTranslation('mcp');
  const { providers } = useMCPStore();
  const displayName = entry?.displayName || entry?.name || server?.name || server?.id || t('server.unknown');
  const description = entry?.description || t('server.custom_description');
  const category = entry?.category || 'custom';
  const logoUrl = entry?.logoUrl;
  const [logoError, setLogoError] = React.useState(false);

  // Get provider homepage if available
  const provider = providers.find(p => p.id === entry?.source);
  const providerHomepage = provider?.homepage;

  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = () => {
    setShowDeleteDialog(false);
    onDelete?.();
  };

  const handleSourceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (providerHomepage) {
      window.levante.openExternal(providerHomepage);
    }
  };

  return (
    <Card className="relative overflow-hidden border border-border">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Logo */}
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {logoUrl && !logoError ? (
                <img
                  src={logoUrl}
                  alt={`${displayName} logo`}
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <Square className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg truncate">{displayName}</h3>
            </div>
          </div>
          {/* Switch solo en modo Active */}
          {mode === 'active' && (
            <Switch
              checked={server?.enabled !== false}
              disabled={status === 'connecting' || status === 'pending_oauth'}
              onCheckedChange={onToggle}
            />
          )}
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <Badge variant="secondary" className="text-xs">
            {category}
          </Badge>
          {/* Custom badge — cuando no hay entrada de catálogo */}
          {mode === 'active' && !entry && (
            <Badge variant="outline" className="text-xs">
              Custom
            </Badge>
          )}
          {/* Source badge (official/community) */}
          {entry?.source && SOURCE_CONFIG[entry.source] && (
            <Badge
              variant={SOURCE_CONFIG[entry.source].variant}
              className="text-xs gap-1"
            >
              {React.createElement(SOURCE_CONFIG[entry.source].icon, { className: 'h-3 w-3' })}
              {SOURCE_CONFIG[entry.source].label}
            </Badge>
          )}
          {/* Status badge (only for deprecated/experimental) */}
          {entry?.status && entry.status !== 'active' && STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG] && (
            <Badge
              variant="outline"
              className={`text-xs gap-1 ${STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG].className}`}
            >
              {React.createElement(STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG].icon, { className: 'h-3 w-3' })}
              {STATUS_CONFIG[entry.status as keyof typeof STATUS_CONFIG].label}
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {description}
        </p>

        {/* Status indicator solo en modo Active y cuando está conectado/conectando/oauth */}
        {mode === 'active' && (status === 'connected' || status === 'connecting' || status === 'pending_oauth') && (
          <div className="flex items-center">
            <ConnectionStatus
              serverId={server?.id || entry?.id || 'unknown'}
              status={status}
              size="sm"
              variant="indicator"
            />
          </div>
        )}
      </CardContent>

      <CardFooter className="p-6 pt-0">
        <div className="flex gap-2 w-full">
          {/* Botón diferente según modo */}
          {mode === 'store' ? (
            // Store: Botón "Install" / "Installing" / "Installed" + Info button
            <>
              <Button
                variant={isActive ? 'secondary' : 'default'}
                size="sm"
                className="flex-1"
                onClick={onAddToActive}
                disabled={isActive || isInstalling}
              >
                {isInstalling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('server.installing')}
                  </>
                ) : isActive ? (
                  t('server.installed')
                ) : (
                  t('server.install')
                )}
              </Button>

              {onShowInfo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onShowInfo}
                  title={t('server.view_info')}
                >
                  <Info className="w-4 h-4" />
                </Button>
              )}
            </>
          ) : (
            // Active: Botones "Configure" y "Delete"
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onConfigure}
                disabled={status === 'connecting' || status === 'pending_oauth'}
              >
                <Settings className="w-4 h-4 mr-2" />
                {t('server.configure')}
              </Button>

              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteClick}
                  disabled={status === 'connecting' || status === 'pending_oauth'}
                  title={t('server.delete')}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </CardFooter>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialog.delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              <span dangerouslySetInnerHTML={{ __html: t('dialog.delete_description', { name: displayName }) }} />
              <br />
              <br />
              {t('dialog.delete_warning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('dialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {t('dialog.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Overlay solo en modo Active */}
      {mode === 'active' && (status === 'connecting' || status === 'pending_oauth') && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <ConnectionStatus
            serverId={server?.id || entry?.id || 'unknown'}
            status={status}
            size="lg"
            variant="full"
            showLabel={true}
          />
        </div>
      )}
    </Card>
  );
}
