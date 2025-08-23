import { useState, useCallback } from 'react'
import { UIMessage } from 'ai'

// Use AI SDK compatible status types
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
}

export function useElectronChat(): UseElectronChatResult {
  const [messages, setMessages] = useState<ElectronMessage[]>([])
  const [status, setStatus] = useState<ElectronChatStatus>('ready')

  const sendMessage = useCallback(async (
    message: { text: string }, 
    options?: UseElectronChatOptions
  ) => {
    const { model = 'openai/gpt-4o', webSearch = false } = options?.body || {}
    
    // Add user message
    const userMessage: ElectronMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: message.text,
      parts: [{ type: 'text', text: message.text }]
    }
    
    setMessages(prev => [...prev, userMessage])
    setStatus('submitted')
    
    // Prepare assistant message
    const assistantMessage: ElectronMessage = {
      id: `assistant_${Date.now()}`,
      role: 'assistant',
      content: '',
      parts: []
    }
    
    setMessages(prev => [...prev, assistantMessage])
    setStatus('streaming')
    
    try {
      // Convert to UIMessage format for the API
      // Use functional setState to get current messages without closure dependency
      let currentMessages: ElectronMessage[] = []
      setMessages(prev => {
        currentMessages = prev
        return prev
      })
      
      const apiMessages: UIMessage[] = [...currentMessages, userMessage].map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        parts: [
          {
            type: 'text' as const,
            text: msg.content
          }
        ]
      }))
      
      await window.levante.streamChat(
        {
          messages: apiMessages,
          model,
          webSearch
        },
        (chunk) => {
          if (chunk.delta) {
            setMessages(prev => {
              const lastMessageIndex = prev.length - 1
              const lastMessage = prev[lastMessageIndex]
              
              if (lastMessage && lastMessage.role === 'assistant') {
                // ✅ SIMPLE: Update content directly (Expo pattern)
                return prev.map((msg, index) => 
                  index === lastMessageIndex
                    ? { 
                        ...msg, 
                        content: (msg.content || '') + chunk.delta,
                        parts: [{ type: 'text' as const, text: (msg.content || '') + chunk.delta }]
                      }
                    : msg
                )
              }
              
              return prev
            })
          }
          
          if (chunk.sources) {
            setMessages(prev => {
              const updated = [...prev]
              const lastMessage = updated[updated.length - 1]
              
              if (lastMessage && lastMessage.role === 'assistant') {
                // Add source parts
                chunk.sources?.forEach(source => {
                  lastMessage.parts.push({
                    type: 'source-url',
                    url: source.url
                  })
                })
              }
              
              return updated
            })
          }
          
          if (chunk.reasoning) {
            setMessages(prev => {
              const updated = [...prev]
              const lastMessage = updated[updated.length - 1]
              
              if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.parts.push({
                  type: 'reasoning',
                  text: chunk.reasoning
                })
              }
              
              return updated
            })
          }
          
          if (chunk.done) {
            setStatus('ready')
          }
        }
      )
    } catch (error) {
      console.error('Chat error:', error)
      setStatus('error')
      
      // Add error message
      setMessages(prev => {
        const updated = [...prev]
        const lastMessage = updated[updated.length - 1]
        
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.content = 'Sorry, there was an error processing your request.'
          lastMessage.parts = [{ type: 'text', text: lastMessage.content }]
        }
        
        return updated
      })
    }
  }, [])

  return {
    messages,
    status,
    sendMessage
  }
}