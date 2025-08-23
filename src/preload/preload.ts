import { contextBridge, ipcRenderer } from 'electron'
import { UIMessage } from 'ai'

export interface ChatRequest {
  messages: UIMessage[];
  model: string;
  webSearch: boolean;
}

export interface ChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
  sources?: Array<{ url: string; title?: string }>;
  reasoning?: string;
}

// Define the API interface for type safety
export interface LevanteAPI {
  // App information
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  
  // Chat functionality
  sendMessage: (request: ChatRequest) => Promise<{ success: boolean; response: string; sources?: any[]; reasoning?: string }>
  streamChat: (request: ChatRequest, onChunk: (chunk: ChatStreamChunk) => void) => Promise<string>
  
  // Settings (placeholder for future implementation)
  getSettings: () => Promise<Record<string, any>>
  updateSettings: (settings: Record<string, any>) => Promise<boolean>
  
  // MCP functionality (placeholder for future implementation)
  listMCPServers: () => Promise<any[]>
  invokeMCPTool: (serverId: string, toolId: string, params: any) => Promise<any>
  
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const api: LevanteAPI = {
  getVersion: () => ipcRenderer.invoke('levante/app/version'),
  getPlatform: () => ipcRenderer.invoke('levante/app/platform'),
  
  sendMessage: (request: ChatRequest) => 
    ipcRenderer.invoke('levante/chat/send', request),
  
  streamChat: async (request: ChatRequest, onChunk: (chunk: ChatStreamChunk) => void) => {
    // CRITICAL FIX: Clean up any existing listeners first
    const existingListeners = ipcRenderer.eventNames().filter(name => 
      typeof name === 'string' && name.startsWith('levante/chat/stream/')
    )
    existingListeners.forEach(listenerName => {
      ipcRenderer.removeAllListeners(listenerName)
    })
    
    const { streamId } = await ipcRenderer.invoke('levante/chat/stream', request)
    
    return new Promise<string>((resolve, reject) => {
      let fullResponse = ''
      
      const handleChunk = (_event: any, chunk: ChatStreamChunk) => {
        if (chunk.delta) {
          fullResponse += chunk.delta
        }
        
        onChunk(chunk)
        
        if (chunk.done) {
          ipcRenderer.removeAllListeners(`levante/chat/stream/${streamId}`)
          if (chunk.error) {
            reject(new Error(chunk.error))
          } else {
            resolve(fullResponse)
          }
        }
      }
      
      ipcRenderer.on(`levante/chat/stream/${streamId}`, handleChunk)
    })
  },
    
  getSettings: () => 
    ipcRenderer.invoke('levante/settings/get'),
    
  updateSettings: (settings: Record<string, any>) => 
    ipcRenderer.invoke('levante/settings/update', settings),
    
  listMCPServers: () => 
    ipcRenderer.invoke('levante/mcp/list-servers'),
    
  invokeMCPTool: (serverId: string, toolId: string, params: any) => 
    ipcRenderer.invoke('levante/mcp/invoke-tool', { serverId, toolId, params })
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('levante', api)
  } catch (error) {
    console.error('Failed to expose API:', error)
  }
} else {
  // @ts-ignore (define in dts)
  window.levante = api
}

// Type declaration for global window object
declare global {
  interface Window {
    levante: LevanteAPI
  }
}