import React from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Settings,
  FolderOpen,
  Search,
  Github,
  Database,
  MessageSquare,
  Globe,
  Cloud,
  Plus,
  Trash2
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

interface IntegrationCardProps {
  mode: 'active' | 'store';
  entry?: MCPRegistryEntry;
  server?: MCPServerConfig;
  status: MCPConnectionStatus;
  isActive: boolean;
  onToggle: () => void;
  onConfigure: () => void;
  onAddToActive?: () => void;
  onDelete?: () => void;
}

const iconMap = {
  folder: FolderOpen,
  search: Search,
  github: Github,
  database: Database,
  'message-square': MessageSquare,
  globe: Globe,
  cloud: Cloud,
};

export function IntegrationCard({
  mode,
  entry,
  server,
  status,
  isActive,
  onToggle,
  onConfigure,
  onAddToActive,
  onDelete
}: IntegrationCardProps) {
  const { t } = useTranslation('mcp');
  const displayName = entry?.name || server?.name || server?.id || t('server.unknown');
  const description = entry?.description || t('server.custom_description');
  const category = entry?.category || 'custom';
  const iconName = entry?.icon || 'folder';

  const IconComponent = iconMap[iconName as keyof typeof iconMap] || FolderOpen;

  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = () => {
    setShowDeleteDialog(false);
    onDelete?.();
  };

  return (
    <Card className="relative overflow-hidden border-none">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-md">
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{displayName}</h3>
              <Badge variant="secondary" className="text-xs">
                {category}
              </Badge>
            </div>
          </div>
          {/* Switch solo en modo Active */}
          {mode === 'active' && (
            <Switch
              checked={status === 'connected'}
              disabled={status === 'connecting'}
              onCheckedChange={onToggle}
            />
          )}
        </div>

        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {description}
        </p>

        {/* Status indicator solo en modo Active */}
        {mode === 'active' && (
          <div className="flex items-center justify-between">
            <ConnectionStatus
              serverId={server?.id || entry?.id || 'unknown'}
              status={status}
              size="sm"
              variant="indicator"
            />
            <Badge variant={server?.enabled !== false ? 'default' : 'secondary'}>
              {server?.enabled !== false ? t('server.active') : t('server.disabled')}
            </Badge>
          </div>
        )}

        {/* Badge en modo Store */}
        {mode === 'store' && (
          <Badge variant={isActive ? 'default' : 'outline'}>
            {isActive ? t('server.already_added') : 'Available'}
          </Badge>
        )}
      </CardContent>

      <CardFooter className="p-6 pt-0">
        <div className="flex gap-2 w-full">
          {/* Botón diferente según modo */}
          {mode === 'store' ? (
            // Store: Botón "Add to Active"
            !isActive ? (
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={onAddToActive}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('server.add_to_active')}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled
              >
                {t('server.already_added')}
              </Button>
            )
          ) : (
            // Active: Botones "Configure" y "Delete"
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onConfigure}
                disabled={status === 'connecting'}
              >
                <Settings className="w-4 h-4 mr-2" />
                {t('server.configure')}
              </Button>

              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteClick}
                  disabled={status === 'connecting'}
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
      {mode === 'active' && status === 'connecting' && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <ConnectionStatus
            serverId={server?.id || entry?.id || 'unknown'}
            status="connecting"
            size="lg"
            variant="full"
            showLabel={true}
          />
        </div>
      )}
    </Card>
  );
}