import { ipcMain } from "electron";
import { getLogger } from "../../services/logging";

const logger = getLogger();

export function registerExtractionHandlers(mcpService: any) {
  // Extract MCP configuration from text using AI
  ipcMain.handle("levante/mcp/extract-config", async (_, text: string) => {
    try {
      logger.mcp.info("IPC handler: levante/mcp/extract-config called", {
        textLength: text.length,
        textPreview: text.slice(0, 100) + (text.length > 100 ? "..." : ""),
      });

      const { mcpExtractionService } = await import(
        "../../services/mcpExtractionService.js"
      );
      const { detectSensitiveData, sanitizeSensitiveData } = await import(
        "../../utils/sensitiveDataDetector.js"
      );
      const { preferencesService } = await import(
        "../../services/preferencesService.js"
      );

      logger.mcp.debug("Modules imported successfully");

      // Step 1: Detect sensitive data
      logger.mcp.debug("Step 1: Detecting sensitive data");
      const detection = detectSensitiveData(text);
      if (detection.hasSensitiveData) {
        logger.mcp.warn("Sensitive data detected in input", {
          detectionsCount: detection.detections.length,
          detectionTypes: detection.detections.map((d) => d.type),
          highestConfidence: detection.detections[0]?.confidence,
        });

        // Auto-sanitize high confidence detections
        const { sanitized, replacements } = sanitizeSensitiveData(text);
        if (replacements > 0) {
          logger.mcp.info("Auto-sanitized sensitive data", { replacements });
          text = sanitized;
        }
      } else {
        logger.mcp.debug("No sensitive data detected");
      }

      // Step 1.5: Check if input is a URL and fetch content
      const urlRegex = /^https?:\/\/.+/i;
      if (urlRegex.test(text.trim())) {
        logger.mcp.info("Input detected as URL, fetching content", {
          url: text.trim(),
        });

        try {
          const { fetchUrlContent } = await import(
            "../../utils/urlContentFetcher.js"
          );
          const fetchedContent = await fetchUrlContent(text.trim());

          if (fetchedContent) {
            logger.mcp.info("Successfully fetched URL content", {
              contentLength: fetchedContent.length,
              contentPreview:
                fetchedContent.slice(0, 500) +
                (fetchedContent.length > 500 ? "..." : ""),
            });

            // Log if we can find potential baseUrl in the content
            const urlMatches = fetchedContent.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/g);
            if (urlMatches) {
              logger.mcp.debug("Found URLs in fetched content", {
                urls: urlMatches.slice(0, 10), // Log first 10 URLs
              });
            }

            text = fetchedContent;
          } else {
            logger.mcp.warn("Failed to fetch URL content, using URL as-is");
          }
        } catch (fetchError: any) {
          logger.mcp.warn("Error fetching URL content, using URL as-is", {
            error:
              fetchError instanceof Error ? fetchError.message : fetchError,
          });
        }
      }

      // Step 2: Use OpenAI directly for MCP extraction (more reliable for structured outputs)
      logger.mcp.debug("Step 2: Loading user preferences");
      const preferences = await preferencesService.getAll();

      // Always use OpenAI for MCP extraction
      const openaiProvider = preferences.providers?.find(
        (p) => p.type === "openai"
      );

      if (!openaiProvider || !openaiProvider.apiKey) {
        logger.mcp.error("OpenAI provider not configured", {
          hasOpenAI: !!openaiProvider,
          hasApiKey: !!openaiProvider?.apiKey,
        });
        return {
          success: false,
          error: "OpenAI not configured",
          suggestion:
            "Please configure OpenAI provider with an API key in Settings to use automatic MCP extraction",
        };
      }

      const finalProvider = "openai";
      const finalModel = "gpt-5-2025-08-07"; // Use latest GPT-4o model
      const finalApiKey = openaiProvider.apiKey;

      logger.mcp.info("Using OpenAI for MCP extraction", {
        provider: finalProvider,
        model: finalModel,
        hasApiKey: !!finalApiKey,
      });

      // Step 4: Set API key as environment variable temporarily
      const envVarName = `${finalProvider.toUpperCase()}_API_KEY`;
      const originalEnvValue = process.env[envVarName];

      if (finalApiKey) {
        logger.mcp.debug("Setting temporary API key in environment", {
          envVarName,
        });
        process.env[envVarName] = finalApiKey;
      }

      try {
        // Extract configuration using AI
        logger.mcp.info("Step 4: Starting AI extraction process");
        const result = await mcpExtractionService.extractConfig({
          text,
          userModel: finalModel,
          userProvider: finalProvider,
          apiKey: finalApiKey,
        });

        logger.mcp.debug("Extraction service returned result", {
          success: result.success,
          hasConfig: !!result.config,
          error: result.error,
        });

        if (!result.success) {
          logger.mcp.warn("Extraction unsuccessful", {
            error: result.error,
            suggestion: result.suggestion,
          });
          return {
            success: false,
            error: result.error,
            suggestion: result.suggestion,
          };
        }

        logger.mcp.info("MCP config extracted successfully", {
          name: result.config?.name,
          type: result.config?.type,
          command: result.config?.command,
          hasArgs: !!result.config?.args,
          hasEnv: !!result.config?.env,
        });

        return {
          success: true,
          data: result.config,
        };
      } finally {
        // Restore original environment variable
        if (originalEnvValue !== undefined) {
          process.env[envVarName] = originalEnvValue;
        } else if (finalApiKey) {
          delete process.env[envVarName];
        }
      }
    } catch (error: any) {
      logger.mcp.error("MCP extraction IPC handler failed", {
        error: error.message,
        errorType: error?.constructor?.name,
        errorStack: error.stack,
      });
      return {
        success: false,
        error: error.message || "Failed to extract configuration",
      };
    }
  });

  // Check if OpenAI is configured for MCP extraction
  ipcMain.handle("levante/mcp/check-structured-output-support", async () => {
    try {
      const { preferencesService } = await import(
        "../../services/preferencesService.js"
      );

      const preferences = await preferencesService.getAll();

      // Check if OpenAI is configured (we always use OpenAI for MCP extraction)
      const openaiProvider = preferences.providers?.find(
        (p) => p.type === "openai"
      );
      const supported = !!(openaiProvider && openaiProvider.apiKey);

      return {
        success: true,
        data: {
          supported,
          currentModel: "gpt-5-2025-08-07",
          currentProvider: "openai",
          message: supported
            ? "OpenAI is configured and ready for MCP extraction"
            : "OpenAI provider is required for automatic MCP extraction",
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Verify npm package existence (for deep link security)
  ipcMain.handle("levante/mcp/verify-package", async (_, packageName: string) => {
    try {
      logger.mcp.debug("Verifying npm package", { packageName });

      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
      );

      const exists = response.ok;

      logger.mcp.debug("Package verification result", {
        packageName,
        exists,
        status: response.status,
      });

      return {
        success: true,
        data: {
          exists,
          status: response.status,
        },
      };
    } catch (error: any) {
      logger.mcp.error("Package verification failed", {
        packageName,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  });
}
