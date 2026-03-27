/**
 * Origins Preload API
 *
 * Bridges renderer to main process for Levante Origins (Telegram, etc.)
 */

import { ipcRenderer } from "electron";
import type { OriginStatusEvent } from "../../types/origins";

export const originsApi = {
  telegram: {
    start: () =>
      ipcRenderer.invoke("levante/origins/telegram/start") as Promise<{
        success: boolean;
        data?: OriginStatusEvent;
        error?: string;
      }>,

    stop: () =>
      ipcRenderer.invoke("levante/origins/telegram/stop") as Promise<{
        success: boolean;
        error?: string;
      }>,

    status: () =>
      ipcRenderer.invoke("levante/origins/telegram/status") as Promise<{
        success: boolean;
        data?: OriginStatusEvent;
        error?: string;
      }>,

    validateToken: (token: string) =>
      ipcRenderer.invoke(
        "levante/origins/telegram/validate-token",
        token
      ) as Promise<{
        success: boolean;
        data?: { username: string; firstName: string };
        error?: string;
      }>,

    unlinkOwner: () =>
      ipcRenderer.invoke(
        "levante/origins/telegram/unlink-owner"
      ) as Promise<{
        success: boolean;
        error?: string;
      }>,

    onStatusChange: (callback: (status: OriginStatusEvent) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        status: OriginStatusEvent
      ) => callback(status);
      ipcRenderer.on(
        "levante/origins/telegram/status-changed",
        handler
      );
      return () =>
        ipcRenderer.removeListener(
          "levante/origins/telegram/status-changed",
          handler
        );
    },
  },
};
