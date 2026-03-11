/**
 * SidebarSections
 *
 * Search toggle + tabs (Chats/Files) + content switching.
 */

import { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, FolderTree, FolderOpen, Plus, MoreVertical, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatListContent, type ChatListContentProps } from '@/components/chat/ChatListContent';
import { FileBrowserContent } from '@/components/file-browser';

type SidebarSection = 'chats' | 'files';

export interface SidebarSectionsProps {
  chatListProps: Omit<ChatListContentProps, 'searchQuery'>;
  onNewChat: () => void;
  onExitProject?: () => void;
  loading?: boolean;
  coworkModeEnabled: boolean;
  effectiveCwd: string | null;
}

export function SidebarSections({
  chatListProps,
  onNewChat,
  onExitProject,
  loading,
  coworkModeEnabled,
  effectiveCwd,
}: SidebarSectionsProps) {
  const { t } = useTranslation('chat');
  const [activeSection, setActiveSection] = useState<SidebarSection>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { projects = [], sessions = [], selectedProjectId, onProjectSelect, onCreateProject, onEditProject, onDeleteProject } = chatListProps;

  const showFilesTab = coworkModeEnabled && Boolean(effectiveCwd);

  useEffect(() => {
    if (!showFilesTab && activeSection === 'files') {
      setActiveSection('chats');
    }
  }, [showFilesTab, activeSection]);

  useEffect(() => {
    setSearchQuery('');
  }, [activeSection]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const isInsideProject = Boolean(selectedProjectId);

  return (
    <div className="flex flex-col h-full">
      {/* New Chat + Projects + Search */}
      <div className="px-2">
        {isInsideProject && onExitProject ? (
          /* Inside a project: show back button + new chat */
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onExitProject}>
                <ArrowLeft className="w-4 h-4" />
                {t('chat_list.exit_project')}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onNewChat} disabled={loading}>
                <Plus className="w-4 h-4" />
                {t('chat_list.new_chat')}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
          /* Normal view: new chat + projects collapsible */
          <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen}>
            <SidebarMenu>
              {/* New Chat */}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onNewChat} disabled={loading}>
                  <Plus className="w-4 h-4" />
                  {t('chat_list.new_chat')}
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Projects */}
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton>
                    <FolderOpen className="w-4 h-4" />
                    {t('chat_list.projects_section')}
                    {projects.length > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {projects.length}
                      </span>
                    )}
                  </SidebarMenuButton>
                </CollapsibleTrigger>
              </SidebarMenuItem>
            </SidebarMenu>

            <CollapsibleContent>
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    'group flex items-center gap-2 px-2 py-1.5 rounded-lg mx-2 mb-0.5 cursor-pointer',
                    'hover:bg-accent/30 transition-colors',
                    selectedProjectId === project.id && 'bg-accent/50'
                  )}
                  onClick={() => onProjectSelect?.(project)}
                >
                  <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate flex-1">{project.name}</span>

                  {(onEditProject || onDeleteProject) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 p-0 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical size={12} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onEditProject && (
                          <DropdownMenuItem onSelect={() => onEditProject(project)}>
                            <Pencil size={14} className="mr-2" />
                            {t('chat_list.edit_project')}
                          </DropdownMenuItem>
                        )}
                        {onDeleteProject && (
                          <DropdownMenuItem
                            onSelect={() =>
                              onDeleteProject(
                                project.id,
                                project.name,
                                sessions.filter((s) => s.project_id === project.id).length
                              )
                          }
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 size={14} className="mr-2" />
                            {t('chat_list.delete_project')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}

              {projects.length === 0 && onCreateProject && (
                <button
                  className="w-full text-xs text-muted-foreground hover:text-foreground px-4 py-2 text-left"
                  onClick={onCreateProject}
                >
                  + {t('chat_list.new_project')}
                </button>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Search */}
        <SidebarMenu>
          <SidebarMenuItem>
            {searchOpen ? (
              <div className="relative px-2 py-1">
                <Search
                  className="absolute left-5 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                  size={16}
                />
                <Input
                  ref={searchInputRef}
                  placeholder={
                    activeSection === 'chats'
                      ? t('chat_list.search_placeholder')
                      : t('chat_list.file_browser.search_files_placeholder')
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchOpen(false);
                      setSearchQuery('');
                    }
                  }}
                  onBlur={() => {
                    if (!searchQuery) setSearchOpen(false);
                  }}
                  className="pl-9 h-8"
                />
              </div>
            ) : (
              <SidebarMenuButton onClick={() => setSearchOpen(true)}>
                <Search className="w-4 h-4" />
                {t('chat_list.search_placeholder')}
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </div>

      <div className="flex border-b shrink-0 mt-1">
        <button
          onClick={() => setActiveSection('chats')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
            activeSection === 'chats'
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <MessageSquare size={13} />
          {t('chat_list.file_browser.tab_chats')}
        </button>

        {showFilesTab && (
          <button
            onClick={() => setActiveSection('files')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
              activeSection === 'files'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <FolderTree size={13} />
            {t('chat_list.file_browser.tab_files')}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {activeSection === 'chats' || !showFilesTab ? (
          <ChatListContent {...chatListProps} searchQuery={searchQuery} />
        ) : (
          <FileBrowserContent searchQuery={searchQuery} cwd={effectiveCwd!} />
        )}
      </div>
    </div>
  );
}
