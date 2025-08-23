// Re-export types for backward compatibility
export type ElectronChatStatus = 'ready' | 'streaming' | 'submitted' | 'error'

export interface ElectronMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  parts: Array<{
    type: 'text' | 'source-url' | 'reasoning'
    text?: string
    url?: string
  }>
}

export interface UseElectronChatOptions {
  body?: {
    model?: string
    webSearch?: boolean
  }
}

export interface UseElectronChatResult {
  messages: ElectronMessage[]
  status: ElectronChatStatus
  sendMessage: (message: { text: string }, options?: UseElectronChatOptions) => Promise<void>
  
  // Session management
  currentSession: any
  sessions: any[]
  createNewChat: (title?: string) => Promise<void>
  loadChat: (sessionId: string) => Promise<void>
  deleteChat: (sessionId: string) => Promise<void>
}