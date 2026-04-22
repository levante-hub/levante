/**
 * Cowork Mode IPC Handlers Module
 *
 * Handles cowork-specific IPC communication:
 * - Working directory selection for coding tools
 */

import { ipcMain, dialog, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { promises as fs } from 'node:fs';
import { getLogger } from '../services/logging';
import type { CoworkPrereqStep } from '../services/runtime/coworkPrerequisites';

const logger = getLogger();

const CHANNEL = 'levante/cowork/select-working-directory';
const CHANNEL_VALIDATE = 'levante/cowork/validate-directory';
export const COWORK_PREREQ_CHANNEL = 'levante/cowork/prerequisites-status';

export interface CoworkPrereqStatusPayload {
  step: CoworkPrereqStep;
  detail?: Record<string, unknown>;
  warnings?: string[];
}

/**
 * Broadcast Cowork prerequisite provisioning progress to all renderer windows.
 * Used by aiService to surface PortableGit/Python download progress.
 */
export function broadcastCoworkPrereqStatus(payload: CoworkPrereqStatusPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(COWORK_PREREQ_CHANNEL, payload);
    }
  }
}

export interface SelectWorkingDirectoryOptions {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
}

export interface SelectWorkingDirectoryResult {
  success: boolean;
  data?: {
    path: string;
    canceled: boolean;
  };
  error?: string;
}

export interface ValidateDirectoryResult {
  success: boolean;
  data?: { isDirectory: boolean; resolvedPath: string };
  error?: string;
}

/**
 * Register cowork IPC handlers
 */
export function setupCoworkHandlers(): void {
  // Remove any existing handler to prevent registration conflicts
  ipcMain.removeHandler(CHANNEL);
  ipcMain.removeHandler(CHANNEL_VALIDATE);

  ipcMain.handle(CHANNEL, handleSelectWorkingDirectory);
  ipcMain.handle(CHANNEL_VALIDATE, handleValidateDirectory);

  logger.ipc.info('Cowork handlers registered successfully');
}

/**
 * Handle working directory selection for cowork mode
 */
async function handleSelectWorkingDirectory(
  event: IpcMainInvokeEvent,
  options?: SelectWorkingDirectoryOptions
): Promise<SelectWorkingDirectoryResult> {
  try {
    // Get the window from which the request originated
    const win = BrowserWindow.fromWebContents(event.sender);

    const dialogOptions: Electron.OpenDialogOptions = {
      title: options?.title ?? 'Select Working Directory',
      defaultPath: options?.defaultPath,
      buttonLabel: options?.buttonLabel ?? 'Select',
      properties: ['openDirectory', 'createDirectory'],
    };

    let result: Electron.OpenDialogReturnValue;

    if (win && !win.isDestroyed()) {
      // Show dialog attached to the requesting window
      result = await dialog.showOpenDialog(win, dialogOptions);
    } else {
      // Fallback to unattached dialog if window not available
      result = await dialog.showOpenDialog(dialogOptions);
    }

    const selectedPath = result.filePaths[0] ?? '';

    logger.ipc.info('Cowork directory selection', {
      canceled: result.canceled,
      path: result.canceled ? undefined : selectedPath,
    });

    return {
      success: true,
      data: {
        path: selectedPath,
        canceled: result.canceled,
      },
    };
  } catch (error) {
    logger.ipc.error('Failed to select cowork working directory', {
      error: error instanceof Error ? error.message : error,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function handleValidateDirectory(
  _event: IpcMainInvokeEvent,
  payload: { path?: string }
): Promise<ValidateDirectoryResult> {
  try {
    const inputPath = payload?.path?.trim();
    if (!inputPath) return { success: false, error: 'Empty path' };

    const stat = await fs.stat(inputPath);
    return {
      success: true,
      data: { isDirectory: stat.isDirectory(), resolvedPath: inputPath },
    };
  } catch (error) {
    logger.ipc.warn('validate-directory failed', {
      error: error instanceof Error ? error.message : error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
