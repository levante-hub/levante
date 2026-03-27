import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Radio,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Unlink,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOrigins } from "@/hooks/useOrigins";
import { SettingsSection } from "./SettingsSection";

export const OriginsSection = () => {
  const { t } = useTranslation(["settings", "common"]);
  const {
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
  } = useOrigins();

  const [showToken, setShowToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isRunning = telegramStatus === "running";
  const isStarting = telegramStatus === "starting";

  return (
    <SettingsSection
      icon={<Radio className="w-5 h-5" />}
      title={t("settings:sections.origins")}
    >
      <p className="text-sm text-muted-foreground">
        {t("settings:origins.description")}
      </p>

      {/* Telegram subsection */}
      <div className="space-y-4 border rounded-lg p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            Telegram
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isRunning
                  ? "bg-green-500"
                  : isStarting
                    ? "bg-yellow-500 animate-pulse"
                    : telegramStatus === "error"
                      ? "bg-red-500"
                      : "bg-gray-400"
              }`}
            />
            {botUsername && (
              <span className="text-sm text-muted-foreground font-normal">
                @{botUsername}
              </span>
            )}
          </h4>
          <Switch
            checked={isRunning || isStarting}
            disabled={isStarting || !telegramConfig.botToken}
            onCheckedChange={(checked) =>
              checked ? handleStart() : handleStop()
            }
          />
        </div>

        {/* Bot Token */}
        <div className="space-y-2">
          <Label htmlFor="telegram-token">
            {t("settings:origins.telegram.bot_token.label")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="telegram-token"
              type={showToken ? "text" : "password"}
              value={telegramConfig.botToken}
              onChange={(e) =>
                setTelegramConfig((prev) => ({
                  ...prev,
                  botToken: e.target.value,
                }))
              }
              placeholder="123456:ABC-DEF..."
              disabled={isRunning}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                handleValidateToken(telegramConfig.botToken)
              }
              disabled={!telegramConfig.botToken || state.validating}
            >
              {state.validating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Test"
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings:origins.telegram.bot_token.description")}
          </p>
          {state.validationResult && (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />@
              {state.validationResult.username} (
              {state.validationResult.firstName})
            </div>
          )}
          {state.validationError && (
            <div className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              {state.validationError}
            </div>
          )}
        </div>

        {/* Owner Password */}
        <div className="space-y-2">
          <Label htmlFor="telegram-password">
            {t("settings:origins.telegram.owner_password.label")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="telegram-password"
              type={showPassword ? "text" : "password"}
              value={telegramConfig.ownerPassword}
              onChange={(e) =>
                setTelegramConfig((prev) => ({
                  ...prev,
                  ownerPassword: e.target.value,
                }))
              }
              placeholder={t(
                "settings:origins.telegram.owner_password.placeholder"
              )}
              disabled={isRunning}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings:origins.telegram.owner_password.description")}
          </p>
          {telegramConfig.ownerChatId && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              {t("settings:origins.telegram.owner_linked")} (ID:{" "}
              {telegramConfig.ownerChatId})
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleUnlinkOwner}
                disabled={isRunning}
              >
                <Unlink className="w-3 h-3 mr-1" />
                {t("settings:origins.telegram.unlink")}
              </Button>
            </div>
          )}
        </div>

        {/* Model */}
        <div className="space-y-2">
          <Label htmlFor="telegram-model">
            {t("settings:origins.telegram.model.label")}
          </Label>
          {availableModels.length > 0 ? (
            <Select
              value={telegramConfig.model}
              onValueChange={(value) =>
                setTelegramConfig((prev) => ({
                  ...prev,
                  model: value,
                }))
              }
            >
              <SelectTrigger id="telegram-model">
                <SelectValue placeholder={t("settings:origins.telegram.model.description")} />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name || model.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="telegram-model"
              value={telegramConfig.model}
              onChange={(e) =>
                setTelegramConfig((prev) => ({
                  ...prev,
                  model: e.target.value,
                }))
              }
              placeholder="anthropic/claude-sonnet-4-20250514"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {t("settings:origins.telegram.model.description")}
          </p>
        </div>

        {/* System Prompt */}
        <div className="space-y-2">
          <Label htmlFor="telegram-prompt">
            {t("settings:origins.telegram.system_prompt.label")}
          </Label>
          <Textarea
            id="telegram-prompt"
            value={telegramConfig.systemPrompt}
            onChange={(e) =>
              setTelegramConfig((prev) => ({
                ...prev,
                systemPrompt: e.target.value,
              }))
            }
            className="min-h-[80px] resize-none"
            placeholder={t(
              "settings:origins.telegram.system_prompt.description"
            )}
          />
        </div>

        {/* Auto-start */}
        <div className="flex items-center justify-between">
          <Label htmlFor="telegram-autostart">
            {t("settings:origins.telegram.auto_start.label")}
          </Label>
          <Switch
            id="telegram-autostart"
            checked={telegramConfig.enabled}
            onCheckedChange={(checked) =>
              setTelegramConfig((prev) => ({
                ...prev,
                enabled: checked,
              }))
            }
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4 pt-2">
        <Button
          onClick={handleSave}
          disabled={state.saving || isRunning}
          variant="outline"
          size="sm"
        >
          {state.saving
            ? t("common:status.saving")
            : t("settings:origins.save_button")}
        </Button>
        {state.saved && (
          <div className="flex items-center text-green-600 text-sm">
            <CheckCircle className="w-4 h-4 mr-1" />
            {t("common:status.saved")}
          </div>
        )}
      </div>
    </SettingsSection>
  );
};
