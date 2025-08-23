import { contextBridge, ipcRenderer } from 'electron'

// Define the API interface for type safety
export interface LevanteAPI {
  // App information
  getVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  
  // Chat functionality
  sendMessage: (message: string) => Promise<{ success: boolean; response: string }>
  
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
  
  sendMessage: (message: string) => 
    ipcRenderer.invoke('levante/chat/send', message),
    
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