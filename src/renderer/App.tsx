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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Send, MessageSquare, Settings, User } from 'lucide-react'

function App() {
  const [version, setVersion] = useState<string>('')
  const [platform, setPlatform] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [response, setResponse] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    // Test the IPC connection
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

  const handleSendMessage = async () => {
    if (!message.trim() || loading) return

    setLoading(true)
    try {
      const result = await window.levante.sendMessage(message)
      setResponse(result.response)
    } catch (error) {
      console.error('Failed to send message:', error)
      setResponse('Error: Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

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
            <h1 className="text-2xl font-bold">Chat</h1>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="max-w-4xl mx-auto w-full">
            <Card>
              <CardHeader>
                <CardTitle>AI Assistant</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Response Display */}
                {response && (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground mb-2">Response:</p>
                      <p>{response}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Message Input */}
                <div className="flex gap-2">
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message here..."
                    className="flex-1"
                    rows={3}
                    disabled={loading}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={loading || !message.trim()}
                    size="lg"
                    className="self-end"
                  >
                    {loading ? (
                      'Sending...'
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App