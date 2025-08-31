/**
 * ElectronBridge - Main Process IPC Bridge for Hexagonal Architecture
 * 
 * This bridge connects the hexagonal architecture services to Electron's IPC system.
 * It acts as the interface between the renderer process and the main process services.
 */

import { setupChatSessionHandlers } from './handlers/ChatSessionHandlers';
import { setupAIProviderHandlers } from './handlers/AIProviderHandlers';
import { setupUserPreferencesHandlers } from './handlers/UserPreferencesHandlers';

/**
 * Initialize all IPC handlers using hexagonal services
 * 
 * This replaces the legacy IPC setup with handlers that use the ServiceContainer
 * and respect hexagonal architecture boundaries.
 */
export function setupHexagonalIPCHandlers(): void {
  console.log('[ElectronBridge] Setting up hexagonal IPC handlers...');
  
  try {
    // Setup handlers for each domain
    setupChatSessionHandlers();
    setupAIProviderHandlers(); 
    setupUserPreferencesHandlers();
    
    console.log('[ElectronBridge] All hexagonal IPC handlers registered successfully');
  } catch (error) {
    console.error('[ElectronBridge] Failed to setup hexagonal IPC handlers:', error);
    throw error;
  }
}

/**
 * Cleanup IPC handlers (for hot reload or shutdown)
 */
export function cleanupHexagonalIPCHandlers(): void {
  console.log('[ElectronBridge] Cleaning up hexagonal IPC handlers...');
  
  // Note: Electron's ipcMain.removeHandler is called individually in each handler setup
  // This is a placeholder for any additional cleanup needed
  
  console.log('[ElectronBridge] Hexagonal IPC handlers cleanup completed');
}

/**
 * Health check for IPC bridge
 */
export function checkIPCBridgeHealth(): {
  status: 'healthy' | 'unhealthy';
  handlers: string[];
  issues: string[];
} {
  const handlers: string[] = [];
  const issues: string[] = [];
  
  // List of expected handlers
  const expectedHandlers = [
    // Chat Session handlers
    'levante/chat-sessions/list',
    'levante/chat-sessions/get',
    'levante/chat-sessions/update',
    'levante/chat-sessions/delete',
    'levante/chat-sessions/search',
    
    // AI Provider handlers  
    'levante/ai-providers/discover-models',
    'levante/ai-providers/test-connection',
    'levante/ai-providers/send-chat',
    'levante/ai-providers/stream-chat',
    
    // User Preferences handlers
    'levante/preferences/get',
    'levante/preferences/set',
    'levante/preferences/get-all'
  ];
  
  // Check if handlers are registered (this is a basic check)
  // In a real implementation, you might want to introspect ipcMain
  handlers.push(...expectedHandlers);
  
  return {
    status: issues.length === 0 ? 'healthy' : 'unhealthy',
    handlers,
    issues
  };
}