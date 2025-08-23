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
import { MessageSquare, Settings, User } from 'lucide-react'

interface MainLayoutProps {
  children: React.ReactNode
  title?: string
}

export function MainLayout({ children, title = 'Chat' }: MainLayoutProps) {
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
          <p className="text-sm text-muted-foreground px-2">v{version} • {platform}</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <MessageSquare className="w-4 h-4" />
                  Chat
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Settings className="w-4 h-4" />
                  Settings
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <User className="w-4 h-4" />
                  Profile
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <p className="text-xs text-muted-foreground text-center p-2">
            Electron + React + TypeScript + Shadcn UI foundation is ready! 🚀
          </p>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <h1 className="text-2xl font-bold">{title}</h1>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}