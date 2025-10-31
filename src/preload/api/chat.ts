import { ipcRenderer } from 'electron';
import type { ChatRequest, ChatStreamChunk } from '../types';

export const chatApi = {
  sendMessage: (request: ChatRequest) =>
    ipcRenderer.invoke('levante/chat/send', request),

  streamChat: async (request: ChatRequest, onChunk: (chunk: ChatStreamChunk) => void) => {
    // CRITICAL FIX: Clean up any existing listeners first
    const existingListeners = ipcRenderer.eventNames().filter(name =>
      typeof name === 'string' && name.startsWith('levante/chat/stream/')
    )
    existingListeners.forEach(listenerName => {
      if (typeof listenerName === 'string') {
        ipcRenderer.removeAllListeners(listenerName)
      }
    })

    const { streamId } = await ipcRenderer.invoke('levante/chat/stream', request)

    // Store streamId for potential cancellation
    ;(globalThis as any)._currentStreamId = streamId

    return new Promise<string>((resolve, reject) => {
      let fullResponse = ''

      const handleChunk = (_event: any, chunk: ChatStreamChunk) => {
        if (chunk.delta) {
          fullResponse += chunk.delta
        }

        onChunk(chunk)

        if (chunk.done) {
          ipcRenderer.removeAllListeners(`levante/chat/stream/${streamId}`)
          // Clear current stream ID
          delete (globalThis as any)._currentStreamId
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

  stopStreaming: async (streamId?: string) => {
    const targetStreamId = streamId || (globalThis as any)._currentStreamId
    if (!targetStreamId) {
      return { success: false, error: 'No active stream to stop' }
    }

    try {
      // Clean up listeners
      ipcRenderer.removeAllListeners(`levante/chat/stream/${targetStreamId}`)

      // Notify main process to stop streaming
      const result = await ipcRenderer.invoke('levante/chat/stop-stream', targetStreamId)

      // Clear current stream ID
      delete (globalThis as any)._currentStreamId

      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },
};
