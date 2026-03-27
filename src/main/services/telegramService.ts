/**
 * Telegram Origin Service
 *
 * Manages a Telegram bot that allows the app owner to interact
 * with Levante's AI pipeline from Telegram.
 */

import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import { BrowserWindow } from "electron";
import { AIService } from "./aiService";
import { chatService } from "./chatService";
import { preferencesService } from "./preferencesService";
import { encryptValue, decryptValue, isEncrypted } from "../utils/encryption";
import { getLogger } from "./logging";
import type {
  TelegramOriginConfig,
  OriginStatus,
  OriginStatusEvent,
} from "../../types/origins";
import { DEFAULT_TELEGRAM_CONFIG } from "../../types/origins";
import type { UIMessage } from "ai";

const logger = getLogger();

class TelegramService {
  private bot: Telegraf | null = null;
  private aiService: AIService;
  private status: OriginStatus = "stopped";
  private botUsername: string | null = null;
  private processingLock = false;

  constructor() {
    this.aiService = new AIService();
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    if (this.bot) {
      await this.stop();
    }

    this.setStatus("starting");
    logger.telegram.info("Starting Telegram bot...");

    const config = await this.getConfig();
    if (!config || !config.botToken) {
      this.setStatus("error");
      throw new Error("Telegram bot token is not configured");
    }

    try {
      this.bot = new Telegraf(config.botToken);

      // Register handlers
      this.setupCommands(config);
      this.setupMessageHandlers();

      // Get bot info
      const me = await this.bot.telegram.getMe();
      this.botUsername = me.username ?? null;

      // Launch with long-polling
      this.bot.launch();

      // Handle graceful stop
      this.bot.catch((err: unknown) => {
        logger.telegram.error("Bot error", {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      this.setStatus("running");
      logger.telegram.info("Telegram bot started", {
        username: this.botUsername,
      });
    } catch (error) {
      this.bot = null;
      this.setStatus("error");
      logger.telegram.error("Failed to start Telegram bot", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.bot) {
      try {
        this.bot.stop("SIGTERM");
      } catch {
        // Ignore stop errors
      }
      this.bot = null;
    }
    this.botUsername = null;
    this.setStatus("stopped");
    logger.telegram.info("Telegram bot stopped");
  }

  getStatus(): OriginStatusEvent {
    return {
      origin: "telegram",
      status: this.status,
      botUsername: this.botUsername ?? undefined,
    };
  }

  // --- Config helpers ---

  private async getConfig(): Promise<TelegramOriginConfig | null> {
    try {
      const origins = preferencesService.get("origins") as
        | { telegram?: TelegramOriginConfig }
        | undefined;
      if (!origins?.telegram) return null;

      const config = { ...origins.telegram };

      // Decrypt sensitive fields
      if (config.botToken && isEncrypted(config.botToken)) {
        config.botToken = decryptValue(config.botToken);
      }
      if (config.ownerPassword && isEncrypted(config.ownerPassword)) {
        config.ownerPassword = decryptValue(config.ownerPassword);
      }

      return config;
    } catch (error) {
      logger.telegram.error("Failed to load Telegram config", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async saveConfig(
    updates: Partial<TelegramOriginConfig>
  ): Promise<void> {
    const origins = (preferencesService.get("origins") as {
      telegram?: TelegramOriginConfig;
    }) || {};
    const current = origins.telegram || { ...DEFAULT_TELEGRAM_CONFIG };
    const merged = { ...current, ...updates };

    // Encrypt sensitive fields before saving
    if (merged.botToken && !isEncrypted(merged.botToken)) {
      merged.botToken = encryptValue(merged.botToken);
    }
    if (merged.ownerPassword && !isEncrypted(merged.ownerPassword)) {
      merged.ownerPassword = encryptValue(merged.ownerPassword);
    }

    preferencesService.set("origins", { ...origins, telegram: merged });
  }

  // --- Auth ---

  private isOwner(
    chatId: number,
    config: TelegramOriginConfig
  ): boolean {
    return config.ownerChatId === chatId;
  }

  private async handleAuth(
    ctx: Context,
    password: string,
    config: TelegramOriginConfig
  ): Promise<boolean> {
    if (password === config.ownerPassword) {
      const chatId = ctx.from!.id;
      await this.saveConfig({ ownerChatId: chatId });
      await ctx.reply(
        "You are now linked as the owner of this Levante bot."
      );
      logger.telegram.info("Owner linked", { chatId });
      this.broadcastStatus();
      return true;
    }
    await ctx.reply("Incorrect password. Try again.");
    return false;
  }

  // --- Commands ---

  private setupCommands(config: TelegramOriginConfig): void {
    if (!this.bot) return;

    this.bot.command("start", async (ctx) => {
      const cfg = await this.getConfig();
      if (!cfg) return;

      if (cfg.ownerChatId === null) {
        await ctx.reply(
          "Welcome to Levante. Send the owner password to link your account."
        );
      } else if (this.isOwner(ctx.from.id, cfg)) {
        await ctx.reply(
          `Levante bot is running.\nModel: ${cfg.model || "not set"}\nUse /model, /provider, or /status for info.`
        );
      } else {
        await ctx.reply("This bot is private.");
      }
    });

    this.bot.command("model", async (ctx) => {
      const cfg = await this.getConfig();
      if (!cfg || !this.isOwner(ctx.from.id, cfg)) {
        await ctx.reply("Unauthorized.");
        return;
      }

      const args = ctx.message.text.split(" ").slice(1).join(" ").trim();
      if (!args) {
        await ctx.reply(`Current model: ${cfg.model || "not set"}`);
        return;
      }

      await this.saveConfig({ model: args });
      await ctx.reply(`Model changed to: ${args}`);
      logger.telegram.info("Model changed via Telegram", { model: args });
    });

    this.bot.command("provider", async (ctx) => {
      const cfg = await this.getConfig();
      if (!cfg || !this.isOwner(ctx.from.id, cfg)) {
        await ctx.reply("Unauthorized.");
        return;
      }

      const providers = preferencesService.get("providers") as
        | Array<{ name: string; type: string }>
        | undefined;
      if (!providers || providers.length === 0) {
        await ctx.reply("No providers configured.");
        return;
      }

      const list = providers
        .map((p) => `- ${p.name} (${p.type})`)
        .join("\n");
      await ctx.reply(`Available providers:\n${list}`);
    });

    this.bot.command("status", async (ctx) => {
      const cfg = await this.getConfig();
      if (!cfg || !this.isOwner(ctx.from.id, cfg)) {
        await ctx.reply("Unauthorized.");
        return;
      }

      let msgCount = 0;
      if (cfg.sessionId) {
        try {
          const msgs = await chatService.getMessages({
            session_id: cfg.sessionId,
            limit: 1,
          });
          if (msgs.success && msgs.data) {
            msgCount = msgs.data.total;
          }
        } catch {
          // ignore
        }
      }

      await ctx.reply(
        `Status: Running\nBot: @${this.botUsername}\nModel: ${cfg.model || "not set"}\nMessages: ${msgCount}\nOwner: Linked (${cfg.ownerChatId})`
      );
    });
  }

  // --- Message handlers ---

  private setupMessageHandlers(): void {
    if (!this.bot) return;

    // Text messages
    this.bot.on(message("text"), async (ctx) => {
      // Skip commands (already handled)
      if (ctx.message.text.startsWith("/")) return;

      const config = await this.getConfig();
      if (!config) return;

      const chatId = ctx.from.id;

      // Auth flow
      if (config.ownerChatId === null) {
        await this.handleAuth(ctx, ctx.message.text, config);
        return;
      }

      if (!this.isOwner(chatId, config)) {
        await ctx.reply("This bot is private.");
        return;
      }

      // Process with AI
      await this.processMessage(ctx, ctx.message.text, config);
    });

    // Photo messages
    this.bot.on(message("photo"), async (ctx) => {
      const config = await this.getConfig();
      if (!config || config.ownerChatId === null) return;
      if (!this.isOwner(ctx.from.id, config)) return;

      try {
        const photos = ctx.message.photo;
        const photo = photos[photos.length - 1]; // Highest quality
        const file = await ctx.telegram.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

        const response = await fetch(fileUrl);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const dataUrl = `data:image/jpeg;base64,${base64}`;

        const caption = ctx.message.caption || "What is in this image?";
        await this.processMessage(ctx, caption, config, [dataUrl]);
      } catch (error) {
        logger.telegram.error("Failed to process photo", {
          error: error instanceof Error ? error.message : String(error),
        });
        await ctx.reply("Failed to process the image.");
      }
    });

    // Document messages
    this.bot.on(message("document"), async (ctx) => {
      const config = await this.getConfig();
      if (!config || config.ownerChatId === null) return;
      if (!this.isOwner(ctx.from.id, config)) return;

      try {
        const doc = ctx.message.document;
        const file = await ctx.telegram.getFile(doc.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;

        const response = await fetch(fileUrl);
        const buffer = await response.arrayBuffer();

        const mimeType = doc.mime_type || "application/octet-stream";
        const isImage = mimeType.startsWith("image/");

        if (isImage) {
          const base64 = Buffer.from(buffer).toString("base64");
          const dataUrl = `data:${mimeType};base64,${base64}`;
          const caption =
            ctx.message.caption || "What is in this image?";
          await this.processMessage(ctx, caption, config, [dataUrl]);
        } else {
          // Text-based files
          const text = Buffer.from(buffer).toString("utf-8");
          const caption =
            ctx.message.caption ||
            `File: ${doc.file_name}\n\nContent:\n${text.slice(0, 4000)}`;
          await this.processMessage(ctx, caption, config);
        }
      } catch (error) {
        logger.telegram.error("Failed to process document", {
          error: error instanceof Error ? error.message : String(error),
        });
        await ctx.reply("Failed to process the document.");
      }
    });
  }

  // --- AI interaction ---

  private async getOrCreateSession(
    config: TelegramOriginConfig
  ): Promise<string> {
    if (config.sessionId) {
      // Verify it still exists
      const session = await chatService.getSession(config.sessionId);
      if (session.success && session.data) {
        return config.sessionId;
      }
    }

    // Create new session
    const result = await chatService.createSession({
      title: "Telegram",
      model: config.model || "default",
      session_type: "origin-telegram",
    });

    if (!result.success || !result.data) {
      throw new Error("Failed to create Telegram session");
    }

    const sessionId = result.data.id;
    await this.saveConfig({ sessionId });
    logger.telegram.info("Created Telegram session", { sessionId });
    return sessionId;
  }

  private async processMessage(
    ctx: Context,
    text: string,
    config: TelegramOriginConfig,
    imageDataUrls?: string[]
  ): Promise<void> {
    // Simple lock to prevent concurrent processing
    if (this.processingLock) {
      await ctx.reply("Processing previous message, please wait...");
      return;
    }

    this.processingLock = true;

    try {
      // Send typing indicator
      await ctx.sendChatAction("typing");

      if (!config.model) {
        await ctx.reply(
          "No model configured. Use /model <model-id> to set one."
        );
        return;
      }

      const sessionId = await this.getOrCreateSession(config);

      // Save user message
      await chatService.createMessage({
        session_id: sessionId,
        role: "user",
        content: text,
      });

      // Load conversation history
      const historyResult = await chatService.getMessages({
        session_id: sessionId,
        limit: 50,
        offset: 0,
      });

      const messages: UIMessage[] = [];

      // Add system prompt
      if (config.systemPrompt) {
        messages.push({
          id: "system-telegram",
          role: "system",
          parts: [{ type: "text" as const, text: config.systemPrompt }],
        });
      }

      // Convert DB messages to UIMessage format
      if (historyResult.success && historyResult.data) {
        for (const msg of historyResult.data.items) {
          messages.push({
            id: msg.id,
            role: msg.role as "user" | "assistant",
            parts: [{ type: "text" as const, text: msg.content }],
          });
        }
      }

      // If there are image attachments, modify the last user message
      if (imageDataUrls && imageDataUrls.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === "user") {
          const fileParts = imageDataUrls.map((url) => ({
            type: "file" as const,
            mediaType: "image/jpeg",
            url,
          }));
          lastMsg.parts = [
            { type: "text" as const, text: text },
            ...fileParts,
          ];
        }
      }

      // Keep typing indicator alive
      const typingInterval = setInterval(() => {
        ctx.sendChatAction("typing").catch(() => {});
      }, 4000);

      try {
        // Call AI via streaming (accumulate full response)
        const request = {
          messages,
          model: config.model,
          webSearch: false,
          enableMCP: false,
        };

        let fullResponse = "";

        for await (const chunk of this.aiService.streamChat(request)) {
          if (chunk.delta) {
            fullResponse += chunk.delta;
          }
          if (chunk.error) {
            logger.telegram.error("AI stream error", {
              error: chunk.error,
            });
            break;
          }
        }

        clearInterval(typingInterval);

        if (!fullResponse) {
          await ctx.reply("No response from AI.");
          return;
        }

        // Save assistant message
        await chatService.createMessage({
          session_id: sessionId,
          role: "assistant",
          content: fullResponse,
        });

        // Send formatted response
        await this.sendFormattedResponse(ctx, fullResponse);
      } finally {
        clearInterval(typingInterval);
      }
    } catch (error) {
      logger.telegram.error("Failed to process message", {
        error: error instanceof Error ? error.message : String(error),
      });
      await ctx.reply("An error occurred while processing your message.");
    } finally {
      this.processingLock = false;
    }
  }

  // --- Formatting ---

  private async sendFormattedResponse(
    ctx: Context,
    text: string
  ): Promise<void> {
    const chunks = this.splitMessage(text, 4096);

    for (const chunk of chunks) {
      try {
        // Try MarkdownV2 first
        const formatted = this.escapeMarkdownV2(chunk);
        await ctx.reply(formatted, { parse_mode: "MarkdownV2" });
      } catch {
        try {
          // Fallback to HTML
          const htmlFormatted = this.convertToHtml(chunk);
          await ctx.reply(htmlFormatted, { parse_mode: "HTML" });
        } catch {
          // Fallback to plain text
          await ctx.reply(chunk);
        }
      }

      // Small delay between chunks
      if (chunks.length > 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  private escapeMarkdownV2(text: string): string {
    // Preserve code blocks and inline code
    const codeBlocks: string[] = [];
    let processed = text;

    // Extract code blocks (```...```)
    processed = processed.replace(
      /```([\s\S]*?)```/g,
      (_match, content) => {
        const idx = codeBlocks.length;
        codeBlocks.push(`\`\`\`${content}\`\`\``);
        return `__CODE_BLOCK_${idx}__`;
      }
    );

    // Extract inline code (`...`)
    processed = processed.replace(/`([^`]+)`/g, (_match, content) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`\`${content}\``);
      return `__CODE_BLOCK_${idx}__`;
    });

    // Escape MarkdownV2 special characters
    processed = processed.replace(
      /([_*\[\]()~>#+\-=|{}.!\\])/g,
      "\\$1"
    );

    // Restore code blocks
    for (let i = 0; i < codeBlocks.length; i++) {
      processed = processed.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
    }

    return processed;
  }

  private convertToHtml(text: string): string {
    return text
      .replace(/```(\w*)\n?([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\*([^*]+)\*/g, "<i>$1</i>")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to split at paragraph boundary
      let splitIdx = remaining.lastIndexOf("\n\n", maxLength);
      if (splitIdx <= 0) {
        // Try line boundary
        splitIdx = remaining.lastIndexOf("\n", maxLength);
      }
      if (splitIdx <= 0) {
        // Hard split
        splitIdx = maxLength;
      }

      chunks.push(remaining.slice(0, splitIdx));
      remaining = remaining.slice(splitIdx).trimStart();
    }

    return chunks;
  }

  // --- Status broadcasting ---

  private setStatus(status: OriginStatus): void {
    this.status = status;
    this.broadcastStatus();
  }

  private broadcastStatus(): void {
    const event = this.getStatus();
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send("levante/origins/telegram/status-changed", event);
      } catch {
        // Window may be destroyed
      }
    }
  }
}

export const telegramService = new TelegramService();
