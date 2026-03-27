import { useState, useEffect, useCallback } from "react";
import { getRendererLogger } from "@/services/logger";
import { loadSelectableModels } from "@/lib/selectableModels";
import { usePlatformStore } from "@/stores/platformStore";
import { usePreference } from "@/hooks/usePreferences";
import type { Model } from "../../types/models";
import type {
  TelegramOriginConfig,
  OriginStatus,
  OriginsPreferences,
} from "../../types/origins";
import { DEFAULT_TELEGRAM_CONFIG } from "../../types/origins";

const logger = getRendererLogger();

export const useOrigins = () => {
  const [telegramConfig, setTelegramConfig] =
    useState<TelegramOriginConfig>(DEFAULT_TELEGRAM_CONFIG);
  const [telegramStatus, setTelegramStatus] =
    useState<OriginStatus>("stopped");
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [state, setState] = useState({
    saving: false,
    saved: false,
    validating: false,
    validationResult: null as {
      username: string;
      firstName: string;
    } | null,
    validationError: null as string | null,
  });

  const appMode = usePlatformStore((s) => s.appMode);
  const [useOtherProviders] = usePreference("useOtherProviders");
  const platformModels = usePlatformStore((s) => s.models);

  useEffect(() => {
    loadConfig();
    loadStatus();
    loadModels();

    const unsubscribe =
      window.levante.origins.telegram.onStatusChange((event) => {
        setTelegramStatus(event.status);
        if (event.botUsername) setBotUsername(event.botUsername);
      });

    return unsubscribe;
  }, []);

  const loadConfig = async () => {
    try {
      const result = await window.levante.preferences.get("origins");
      if (result.success && result.data) {
        const origins = result.data as OriginsPreferences;
        if (origins.telegram) {
          setTelegramConfig((prev) => ({ ...prev, ...origins.telegram }));
          return;
        }
      }
      // No telegram config saved yet — default model to lastUsedModel
      const lastModelResult = await window.levante.preferences.get("lastUsedModel");
      if (lastModelResult.success && lastModelResult.data) {
        setTelegramConfig((prev) => ({ ...prev, model: lastModelResult.data as string }));
      }
    } catch (error) {
      logger.preferences.error("Error loading Origins configuration", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  const loadModels = async () => {
    try {
      const result = await loadSelectableModels({
        appMode,
        useOtherProviders: useOtherProviders ?? false,
        platformModels,
      });
      setAvailableModels(result.availableModels);
    } catch (error) {
      logger.preferences.error("Error loading models for Origins", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  const loadStatus = async () => {
    try {
      const result = await window.levante.origins.telegram.status();
      if (result.success && result.data) {
        setTelegramStatus(result.data.status);
        if (result.data.botUsername) {
          setBotUsername(result.data.botUsername);
        }
      }
    } catch (error) {
      logger.preferences.error("Error loading Telegram status", {
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  const handleSave = useCallback(async () => {
    setState((prev) => ({ ...prev, saving: true, saved: false }));

    try {
      const origins: OriginsPreferences = { telegram: telegramConfig };
      const result = await window.levante.preferences.set("origins", origins);

      if (result.success) {
        setState((prev) => ({ ...prev, saving: false, saved: true }));
        setTimeout(() => {
          setState((prev) => ({ ...prev, saved: false }));
        }, 3000);
      } else {
        throw new Error(result.error || "Failed to save");
      }
    } catch (error) {
      logger.preferences.error("Error saving Origins configuration", {
        error: error instanceof Error ? error.message : error,
      });
      setState((prev) => ({ ...prev, saving: false }));
    }
  }, [telegramConfig]);

  const handleValidateToken = useCallback(async (token: string) => {
    setState((prev) => ({
      ...prev,
      validating: true,
      validationResult: null,
      validationError: null,
    }));

    try {
      const result =
        await window.levante.origins.telegram.validateToken(token);
      if (result.success && result.data) {
        setState((prev) => ({
          ...prev,
          validating: false,
          validationResult: result.data!,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          validating: false,
          validationError: result.error || "Invalid token",
        }));
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        validating: false,
        validationError:
          error instanceof Error ? error.message : "Validation failed",
      }));
    }
  }, []);

  const handleStart = useCallback(async () => {
    try {
      const result = await window.levante.origins.telegram.start();
      if (!result.success) {
        logger.preferences.error("Failed to start Telegram bot", {
          error: result.error,
        });
      }
    } catch (error) {
      logger.preferences.error("Error starting Telegram bot", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }, []);

  const handleStop = useCallback(async () => {
    try {
      await window.levante.origins.telegram.stop();
    } catch (error) {
      logger.preferences.error("Error stopping Telegram bot", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }, []);

  const handleUnlinkOwner = useCallback(async () => {
    try {
      const result = await window.levante.origins.telegram.unlinkOwner();
      if (result.success) {
        setTelegramConfig((prev) => ({ ...prev, ownerChatId: null }));
      }
    } catch (error) {
      logger.preferences.error("Error unlinking owner", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }, []);

  return {
    telegramConfig,
    setTelegramConfig,
    telegramStatus,
    botUsername,
    availableModels,
    state,
    handleSave,
    handleValidateToken,
    handleStart,
    handleStop,
    handleUnlinkOwner,
  };
};
