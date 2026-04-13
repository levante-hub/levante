import { useState, useEffect } from 'react';
import { FolderOpen, ArrowUp, MoreVertical, Trash2, AlertTriangle } from 'lucide-react';
import { ChatSession, Project } from '../../types/database';
import { ModelSearchableSelect } from '@/components/ai-elements/model-searchable-select';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatModeTabs } from '@/components/chat/ChatModeTabs';
import { usePreference } from '@/hooks/usePreferences';
import { usePlatformStore } from '@/stores/platformStore';
import { useTranslation } from 'react-i18next';
import { loadSelectableModels, resolveStoredModelForCatalog, formatStoredModelForDisplay } from '@/lib/selectableModels';
import type { Model } from '../../types/models';
import type { SelectableModelsResult } from '@/lib/selectableModels';

interface ProjectPageProps {
  project: Project;
  onSessionSelect: (sessionId: string) => void;
  onNewSessionInProject: (projectId: string, initialMessage?: string, modelId?: string) => void;
  onDeleteSession: (sessionId: string) => Promise<boolean>;
}

function formatDate(timestamp: number, t: (key: string) => string, lng: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t('project_page.today');
  if (diffDays === 1) return t('project_page.yesterday');
  return date.toLocaleDateString(lng, { day: 'numeric', month: 'short' });
}

export function ProjectPage({ project, onSessionSelect, onNewSessionInProject, onDeleteSession }: ProjectPageProps) {
  const { t, i18n } = useTranslation('chat');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');

  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [catalog, setCatalog] = useState<SelectableModelsResult | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [lastUsedModel] = usePreference('lastUsedModel');
  const [useOtherProviders] = usePreference('useOtherProviders');
  const [coworkMode, setCoworkMode] = usePreference('coworkMode');

  const appMode = usePlatformStore((s) => s.appMode);
  const platformModels = usePlatformStore((s) => s.models);
  const platformModelsLoadState = usePlatformStore((s) => s.modelsLoadState);
  const platformModelsLoading = usePlatformStore((s) => s.modelsLoading);
  const platformModelsError = usePlatformStore((s) => s.modelsError);
  const platformRetryModels = usePlatformStore((s) => s.retryModels);
  const isPlatformMode = appMode === 'platform';

  useEffect(() => {
    const loadSessions = async () => {
      setLoading(true);
      const result = await window.levante.projects.getSessions(project.id);
      if (result.success && result.data) {
        setSessions(result.data as ChatSession[]);
      }
      setLoading(false);
    };
    loadSessions();
  }, [project.id]);

  useEffect(() => {
    // In platform mode, wait until catalog finishes its first attempt
    if (isPlatformMode && (platformModelsLoadState === 'idle' || platformModelsLoadState === 'loading')) {
      setModelsLoading(true);
      return;
    }

    const loadModels = async () => {
      setModelsLoading(true);
      const result = await loadSelectableModels({
        appMode,
        useOtherProviders: useOtherProviders ?? false,
        platformModels,
      });
      setAvailableModels(result.availableModels);
      setCatalog(result);

      if (lastUsedModel) {
        const resolved = resolveStoredModelForCatalog(lastUsedModel, result);
        if (resolved) {
          setSelectedModel(resolved);
        } else {
          setSelectedModel('');
        }
      } else {
        setSelectedModel('');
      }
      setModelsLoading(false);
    };
    loadModels();
  }, [lastUsedModel, appMode, platformModels, platformModelsLoadState, useOtherProviders, isPlatformMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedModel) return;
    onNewSessionInProject(project.id, input.trim(), selectedModel);
  };

  const handleDeleteChat = async (sessionId: string) => {
    const success = await onDeleteSession(sessionId);
    if (success) {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex flex-col max-w-3xl mx-auto w-full px-6 py-8 flex-1">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <FolderOpen size={32} className="text-foreground" />
          <h1 className="text-3xl font-bold">{project.name}</h1>
        </div>

        {/* Chat input */}
        <div className="mb-8">
          <ChatModeTabs
            coworkMode={coworkMode ?? false}
            onCoworkModeChange={setCoworkMode}
          />
          <form onSubmit={handleSubmit}>
            <div className="rounded-2xl border bg-muted/50 focus-within:ring-1 focus-within:ring-ring">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('project_page.new_chat_placeholder', { name: project.name })}
                className="w-full px-4 pt-4 pb-2 text-sm resize-none min-h-[80px] bg-transparent outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
              />
              {/* Barra inferior */}
              <div className="flex items-center justify-between px-3 pb-3">
                {isPlatformMode && platformModelsError && availableModels.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-destructive">
                    <AlertTriangle size={14} />
                    <span>{t('project_page.models_error')}</span>
                    <button
                      type="button"
                      onClick={() => platformRetryModels()}
                      className="underline underline-offset-2 hover:opacity-80"
                    >
                      {t('project_page.retry')}
                    </button>
                  </div>
                ) : (
                  <ModelSearchableSelect
                    value={selectedModel}
                    onValueChange={setSelectedModel}
                    models={availableModels}
                    loading={modelsLoading || (isPlatformMode && platformModelsLoading)}
                    placeholder={t('project_page.select_model')}
                    className="h-7 text-xs"
                  />
                )}
                <button
                  type="submit"
                  disabled={!input.trim() || !selectedModel}
                  className="rounded-full p-1.5 bg-foreground text-background disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                >
                  <ArrowUp size={16} />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Session list */}
        <div className="flex-1">
          <div className="flex gap-4 mb-4 border-b">
            <button className="text-sm font-semibold pb-2 border-b-2 border-foreground -mb-px">
              {t('project_page.chats_tab')}
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">{t('project_page.loading')}</div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {t('project_page.no_conversations')}
            </div>
          ) : (
            <div>
              {sessions
                .sort((a, b) => b.updated_at - a.updated_at)
                .map((session, index) => (
                  <div key={session.id}>
                    <div
                      className="group py-3 cursor-pointer hover:bg-accent/20 rounded-lg px-2 -mx-2 transition-colors"
                      onClick={() => onSessionSelect(session.id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">
                            {session.title || t('project_page.untitled')}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {catalog
                              ? formatStoredModelForDisplay(session.model, catalog)
                              : session.model}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 mt-0.5">
                          <div className="text-xs text-muted-foreground">
                            {formatDate(session.updated_at, t, i18n.language)}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DropdownMenuItem
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onSelect={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteChat(session.id);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 size={14} className="mr-2" />
                                {t('chat_list.delete_chat')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                    {index < sessions.length - 1 && (
                      <div className="border-b border-border/50" />
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
