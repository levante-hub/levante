import React, { useState, useEffect } from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar
} from '@/components/ui/sidebar'
import { MessageSquare, Settings, User, Bot, Store, Plus, PanelLeftClose, PanelLeft } from 'lucide-react'
import { getRendererLogger } from '@/services/logger'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
// @ts-ignore - PNG import
import logoIcon from '@/assets/icons/icon.png'

const logger = getRendererLogger();

interface MainLayoutProps {
  children: React.ReactNode
  title?: string
  currentPage?: string
  onPageChange?: (page: string) => void
  sidebarContent?: React.ReactNode // Custom sidebar content for specific pages
  onNewChat?: () => void // Callback for New Chat button
}

// Inner component that has access to useSidebar
function MainLayoutContent({ children, title, currentPage, onPageChange, sidebarContent, onNewChat, version, platform }: MainLayoutProps & { version: string; platform: string }) {
  const { open } = useSidebar()
  const { t } = useTranslation('common')

  return (
    <>
      <Sidebar>
        <SidebarHeader style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="flex flex-col gap-4 p-2 pt-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* Controls row - only show when sidebar is open */}
            {open && (
              <div className="flex items-center gap-1 justify-end pr-2 -pt-6">
                <SidebarTrigger className="h-7 w-7 shrink-0" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onNewChat}
                  className="h-7 px-2 gap-1"
                  title={t('actions.new_chat')}
                >
                  <Plus size={14} />
                  <span className="text-sm">{t('actions.new_chat')}</span>
                </Button>
              </div>
            )}

            {/* Logo and title */}
            <button
              onClick={onNewChat}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
              title={t('actions.new_chat')}
            >
              <img
                src={logoIcon}
                alt={t('app.logo_alt')}
                className="w-6 h-6 rounded-sm"
              />
              <h2 className="text-lg font-semibold">{t('app.name')}</h2>
            </button>

          </div>
        </SidebarHeader>
        <SidebarContent>
          {sidebarContent ? (
            // Custom sidebar content for specific pages (like ChatList for chat page)
            sidebarContent
          ) : (
            // Default navigation sidebar
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => onPageChange?.('chat')}
                    isActive={currentPage === 'chat'}
                  >
                    <MessageSquare className="w-4 h-4" />
                    {t('navigation.chat')}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onPageChange?.('store')}
                isActive={currentPage === 'store'}
              >
                <Store className="w-4 h-4" />
                {t('navigation.mcp')}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onPageChange?.('model')}
                isActive={currentPage === 'model'}
              >
                <Bot className="w-4 h-4" />
                {t('navigation.models')}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onPageChange?.('settings')}
                isActive={currentPage === 'settings'}
              >
                <Settings className="w-4 h-4" />
                {t('navigation.settings')}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="border-t pt-2">
            <p className="text-xs text-muted-foreground text-center p-2">
              v{version} • {platform}
            </p>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className='rounded-l-2xl h-screen flex flex-col'>
        {/* Custom titlebar for macOS - draggable area with controls */}
        <header
          className="flex shrink-0 items-center h-12 px-2"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {/* Only show controls when sidebar is closed */}
          {!open && (
            <div
              className="flex items-center gap-1 ml-16"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <SidebarTrigger className="h-7 w-7" />
              <Button
                variant="ghost"
                size="sm"
                onClick={onNewChat}
                className="h-7 px-2 gap-1"
                title={t('actions.new_chat')}
              >
                <Plus size={14} />
                <span className="text-xs">{t('actions.new_chat')}</span>
              </Button>
            </div>
          )}

          {/* Center title */}
          <div className={`flex-1 text-center ${!open ? '' : 'ml-16'}`}>
            <h1 className="text-sm font-medium text-muted-foreground">{title}</h1>
          </div>

          {/* Right side spacer to balance layout */}
          {!open && <div className="w-32"></div>}
        </header>

        <div className="flex-1 overflow-hidden px-0 py-2">
          {children}
        </div>
      </SidebarInset>
    </>
  )
}

export function MainLayout({ children, title = 'Chat', currentPage = 'chat', onPageChange, sidebarContent, onNewChat }: MainLayoutProps) {
  const [version, setVersion] = useState<string>('')
  const [platform, setPlatform] = useState<string>('')

  useEffect(() => {
    const loadAppInfo = async () => {
      try {
        const appVersion = await window.levante.getVersion()
        const appPlatform = await window.levante.getPlatform()
        setVersion(appVersion)
        setPlatform(appPlatform)
      } catch (error) {
        logger.core.error('Failed to load app info in MainLayout', { error: error instanceof Error ? error.message : error })
      }
    }

    loadAppInfo()
  }, [])

  return (
    <SidebarProvider>
      <MainLayoutContent
        children={children}
        title={title}
        currentPage={currentPage}
        onPageChange={onPageChange}
        sidebarContent={sidebarContent}
        onNewChat={onNewChat}
        version={version}
        platform={platform}
      />
    </SidebarProvider>
  )
}
