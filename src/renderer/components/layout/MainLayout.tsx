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
  SidebarTrigger
} from '@/components/ui/sidebar'
import { MessageSquare, Settings, Bot, Store, Search } from 'lucide-react'

interface MainLayoutProps {
  children: React.ReactNode
  title?: string
  currentPage?: string
  onPageChange?: (page: string) => void
  sidebarContent?: React.ReactNode // Custom sidebar content for specific pages
}

export function MainLayout({ children, title = 'Chat', currentPage = 'chat', onPageChange, sidebarContent }: MainLayoutProps) {
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
        console.error('Failed to load app info:', error)
      }
    }

    loadAppInfo()
  }, [])

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <h2 className="text-lg font-semibold p-2">Levante</h2>
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
                    Chat
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => onPageChange?.('search')}
                    isActive={currentPage === 'search'}
                  >
                    <Search className="w-4 h-4" />
                    Search
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
                Store
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onPageChange?.('model')}
                isActive={currentPage === 'model'}
              >
                <Bot className="w-4 h-4" />
                Model
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onPageChange?.('settings')}
                isActive={currentPage === 'settings'}
              >
                <Settings className="w-4 h-4" />
                Settings
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
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <h1 className="text-2xl font-bold">{title}</h1>
          </div>
        </header>
        <div className="flex-1 overflow-hidden px-0 py-2">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}