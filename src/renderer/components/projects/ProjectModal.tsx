import { useState, useEffect, useMemo, useCallback, DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, FolderPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { Project, CreateProjectInput, UpdateProjectInput } from '../../../types/database';

function sanitizeProjectName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
    || 'project';
}

type CwdMode = 'auto' | 'existing';

interface ProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
  onSave: (input: CreateProjectInput | UpdateProjectInput) => Promise<void>;
}

export function ProjectModal({ open, onOpenChange, project, onSave }: ProjectModalProps) {
  const { t } = useTranslation('chat');
  const isEditing = !!project;

  const [name, setName] = useState('');
  const [cwd, setCwd] = useState('');
  const [cwdMode, setCwdMode] = useState<CwdMode>('auto');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  // Preview of the auto-generated path
  const autoPath = useMemo(() => {
    const safeName = sanitizeProjectName(name);
    return `~/levante/projects/${safeName}/`;
  }, [name]);

  // Reset form when modal opens/closes or project changes
  useEffect(() => {
    if (open) {
      setName(project?.name ?? '');
      setCwd(project?.cwd ?? '');
      setDescription(project?.description ?? '');
      setCwdMode(isEditing && project?.cwd ? 'existing' : 'auto');
      setIsDragOver(false);
      setDropError(null);
    }
  }, [open, project, isEditing]);

  const handleSelectDirectory = async () => {
    const result = await window.levante.cowork.selectWorkingDirectory({
      title: t('chat_list.project_modal.cwd_label'),
      buttonLabel: t('chat_list.project_modal.save'),
    });
    if (result.success && result.data && !result.data.canceled) {
      setCwd(result.data.path);
      setDropError(null);
    }
  };

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDropError(null);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const droppedPath = window.levante.fs.getPathForFile(file);
    if (!droppedPath) {
      setDropError(t('chat_list.project_modal.cwd_drop_error_missing_path'));
      return;
    }

    const validation = await window.levante.cowork.validateDirectory(droppedPath);
    if (!validation.success || !validation.data?.isDirectory) {
      setDropError(t('chat_list.project_modal.cwd_drop_error_not_directory'));
      return;
    }

    setCwd(validation.data.resolvedPath);
  }, [t]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const customCwd = cwdMode === 'existing' ? cwd.trim() : '';

      if (isEditing && project) {
        await onSave({
          id: project.id,
          name: name.trim(),
          cwd: customCwd || null,
          description: description.trim() || null,
        } as UpdateProjectInput);
      } else {
        await onSave({
          name: name.trim(),
          cwd: customCwd || undefined,
          description: description.trim() || undefined,
        } as CreateProjectInput);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !!name.trim() &&
    !saving &&
    (cwdMode === 'auto' || !!cwd.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t('chat_list.project_modal.title_edit')
              : t('chat_list.project_modal.title_create')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <Label htmlFor="project-name">{t('chat_list.project_modal.name_label')}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('chat_list.project_modal.name_placeholder')}
              maxLength={100}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
          </div>

          {/* CWD */}
          <div className="space-y-2">
            <Label>{t('chat_list.project_modal.cwd_label')}</Label>

            {/* Mode selector */}
            <RadioGroup
              value={cwdMode}
              onValueChange={(value) => {
                const next = value as CwdMode;
                setCwdMode(next);
                if (next === 'auto') {
                  setCwd('');
                  setDropError(null);
                }
              }}
              className="grid grid-cols-2 gap-2"
            >
              <label
                htmlFor="cwd-mode-auto"
                className={[
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  cwdMode === 'auto' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                ].join(' ')}
              >
                <RadioGroupItem id="cwd-mode-auto" value="auto" className="shrink-0" />
                <FolderPlus size={14} className="shrink-0 text-muted-foreground" />
                <span>{t('chat_list.project_modal.cwd_mode_new')}</span>
              </label>

              <label
                htmlFor="cwd-mode-existing"
                className={[
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  cwdMode === 'existing' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                ].join(' ')}
              >
                <RadioGroupItem id="cwd-mode-existing" value="existing" className="shrink-0" />
                <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                <span>{t('chat_list.project_modal.cwd_mode_existing')}</span>
              </label>
            </RadioGroup>

            {/* Case A: New folder */}
            {cwdMode === 'auto' && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
                <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                <span className="text-sm text-muted-foreground truncate">
                  {name.trim() ? autoPath : t('chat_list.project_modal.cwd_auto_preview')}
                </span>
              </div>
            )}

            {/* Case B: Existing folder → drop-zone */}
            {cwdMode === 'existing' && (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleSelectDirectory}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectDirectory();
                    }
                  }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={[
                    'relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors',
                    isDragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                    cwd ? 'border-green-500/50 bg-green-500/5' : '',
                  ].join(' ')}
                >
                  {cwd ? (
                    <>
                      <FolderOpen className="h-8 w-8 text-green-500" />
                      <div className="flex max-w-full items-center gap-2">
                        <span className="truncate text-sm font-medium" title={cwd}>
                          {cwd}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCwd('');
                            setDropError(null);
                          }}
                          aria-label={t('chat_list.project_modal.cwd_clear')}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <FolderOpen className="h-8 w-8 text-muted-foreground" />
                      <p className="text-center text-sm font-medium text-foreground">
                        {t('chat_list.project_modal.cwd_drop_zone')}
                      </p>
                      <p className="text-center text-xs text-muted-foreground">
                        {t('chat_list.project_modal.cwd_drop_zone_hint')}
                      </p>
                    </>
                  )}
                </div>

                {dropError && (
                  <p className="text-xs text-destructive">{dropError}</p>
                )}
              </>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="project-description">
              {t('chat_list.project_modal.description_label')}
            </Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('chat_list.project_modal.description_placeholder')}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('chat_list.project_modal.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t('chat_list.project_modal.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
