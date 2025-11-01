/**
 * OAuth Callback Server IPC Handlers Module
 *
 * Handles OAuth callback server control and MCP OAuth flows:
 * - Starting/stopping local OAuth callback server (shared by OpenRouter and MCP)
 * - MCP OAuth authorization, token management, and refresh
 */

import { ipcMain, IpcMainInvokeEvent } from "electron";
import { getLogger } from "../services/logging";
import { oauthCallbackServer } from "../services/oauth/callbackServer";
import { mcpOAuthService } from "../services/mcp/oauth/mcpOAuthService";
import { mcpOAuthTokenManager } from "../services/mcp/oauth/tokenManager";

const logger = getLogger();

/**
 * Register all OAuth-related IPC handlers
 */
export function setupOAuthHandlers(): void {
  // Callback server control (shared)
  ipcMain.handle("levante/oauth/start-server", handleStartServer);
  ipcMain.handle("levante/oauth/stop-server", handleStopServer);

  // MCP OAuth handlers
  ipcMain.handle("levante/mcp/oauth/authorize", handleMcpAuthorize);
  ipcMain.handle("levante/mcp/oauth/get-token", handleGetToken);
  ipcMain.handle("levante/mcp/oauth/delete-token", handleDeleteToken);
  ipcMain.handle("levante/mcp/oauth/refresh-token", handleRefreshToken);
  ipcMain.handle("levante/mcp/oauth/get-status", handleGetStatus);

  logger.core.info("OAuth handlers registered successfully");
}

/**
 * Start the local OAuth callback server
 */
async function handleStartServer(): Promise<{
  success: boolean;
  port?: number;
  callbackUrl?: string;
  error?: string;
}> {
  try {
    logger.core.info("Starting OAuth callback server");
    const result = await oauthCallbackServer.start();
    logger.core.info("OAuth callback server started", result);
    return { success: true, ...result };
  } catch (error) {
    logger.core.error("Error starting OAuth callback server", {
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Stop the OAuth callback server
 */
async function handleStopServer(): Promise<{ success: boolean; error?: string }> {
  try {
    logger.core.info("Stopping OAuth callback server");
    await oauthCallbackServer.stop();
    return { success: true };
  } catch (error) {
    logger.core.error("Error stopping OAuth callback server", {
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Authorize MCP server with OAuth
 * Called when a 401 response is received from an MCP server
 */
async function handleMcpAuthorize(
  _event: IpcMainInvokeEvent,
  serverId: string,
  baseUrl: string,
  scopes?: string[],
  oauthConfig?: {
    client_id?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    revocation_endpoint?: string;
  }
): Promise<{ success: boolean; token?: any; error?: string }> {
  try {
    logger.mcp.info("MCP OAuth authorization requested", {
      serverId,
      baseUrl,
      scopes,
      hasOAuthConfig: !!oauthConfig
    });

    const token = await mcpOAuthService.authorize(serverId, undefined, baseUrl, scopes, oauthConfig);

    return {
      success: true,
      token
    };
  } catch (error) {
    logger.mcp.error("MCP OAuth authorization failed", {
      serverId,
      error: error instanceof Error ? error.message : error
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Get OAuth token for an MCP server
 */
async function handleGetToken(
  _event: IpcMainInvokeEvent,
  serverId: string
): Promise<{ success: boolean; token?: any; error?: string }> {
  try {
    const token = await mcpOAuthTokenManager.getToken(serverId);
    return {
      success: true,
      token
    };
  } catch (error) {
    logger.mcp.error("Failed to get OAuth token", {
      serverId,
      error: error instanceof Error ? error.message : error
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Delete OAuth token for an MCP server
 */
async function handleDeleteToken(
  _event: IpcMainInvokeEvent,
  serverId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await mcpOAuthService.revokeToken(serverId);
    return { success: true };
  } catch (error) {
    logger.mcp.error("Failed to delete OAuth token", {
      serverId,
      error: error instanceof Error ? error.message : error
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Refresh OAuth token for an MCP server
 */
async function handleRefreshToken(
  _event: IpcMainInvokeEvent,
  serverId: string
): Promise<{ success: boolean; token?: any; error?: string }> {
  try {
    const token = await mcpOAuthService.refreshToken(serverId);
    return {
      success: true,
      token
    };
  } catch (error) {
    logger.mcp.error("Failed to refresh OAuth token", {
      serverId,
      error: error instanceof Error ? error.message : error
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Get OAuth status for an MCP server
 */
async function handleGetStatus(
  _event: IpcMainInvokeEvent,
  serverId: string
): Promise<{ success: boolean; hasToken: boolean; isValid: boolean; error?: string }> {
  try {
    const hasToken = !!(await mcpOAuthTokenManager.getToken(serverId));
    const isValid = await mcpOAuthTokenManager.isTokenValid(serverId);

    return {
      success: true,
      hasToken,
      isValid
    };
  } catch (error) {
    logger.mcp.error("Failed to get OAuth status", {
      serverId,
      error: error instanceof Error ? error.message : error
    });
    return {
      success: false,
      hasToken: false,
      isValid: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
