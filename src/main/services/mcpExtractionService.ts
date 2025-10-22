import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { getLogger } from './logging';

const logger = getLogger();

// Schema for extracted MCP configuration
const MCPConfigSchema = z.object({
  name: z.string().describe('Short identifier for the MCP server (e.g., "filesystem", "github")'),
  type: z.enum(['stdio', 'http', 'sse']).describe('Transport type, default to "stdio" if not specified'),
  command: z.string().optional().describe('Executable command (e.g., "npx", "uvx", "node", "python")'),
  args: z.array(z.string()).optional().describe('Array of command arguments'),
  env: z.record(z.string()).optional().describe('Environment variables with placeholder values for secrets'),
});

// Error schema for extraction failures
const ErrorSchema = z.object({
  error: z.string().describe('Brief explanation of what went wrong'),
  suggestion: z.string().describe('Specific guidance for the user'),
});

// Models that support structured output
const STRUCTURED_OUTPUT_MODELS = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4-turbo-preview',
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
    'claude-3-5-haiku-20241022',
  ],
  google: [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-2.0-flash-exp',
  ],
};

interface ExtractionInput {
  text: string;
  userModel: string;
  userProvider: string;
  apiKey?: string;
}

interface ExtractedConfig {
  name: string;
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ExtractionResult {
  success: boolean;
  config?: ExtractedConfig;
  error?: string;
  suggestion?: string;
}

/**
 * MCP Extraction Service
 * Uses AI with structured output to extract MCP configuration from unstructured text
 */
class MCPExtractionService {
  /**
   * Check if a given model supports structured output
   */
  supportsStructuredOutput(provider: string, model: string): boolean {
    const providerModels = STRUCTURED_OUTPUT_MODELS[provider as keyof typeof STRUCTURED_OUTPUT_MODELS];
    if (!providerModels) return false;

    return providerModels.some(supportedModel =>
      model.toLowerCase().includes(supportedModel.toLowerCase())
    );
  }

  /**
   * Get supported models list for user display
   */
  getSupportedModels(): { provider: string; models: string[] }[] {
    return Object.entries(STRUCTURED_OUTPUT_MODELS).map(([provider, models]) => ({
      provider,
      models,
    }));
  }

  /**
   * Create AI provider instance based on user's provider
   */
  private createProvider(provider: string, apiKey?: string) {
    switch (provider.toLowerCase()) {
      case 'openai':
        return createOpenAI({
          apiKey: apiKey || process.env.OPENAI_API_KEY,
        });

      case 'anthropic':
        return createAnthropic({
          apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
        });

      case 'google':
        return createGoogleGenerativeAI({
          apiKey: apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        });

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * System prompt for MCP extraction
   */
  private getSystemPrompt(): string {
    return `You are an MCP (Model Context Protocol) configuration expert.
Extract MCP server configuration from user-provided text and return ONLY valid JSON.

The user may provide:
- GitHub repository URLs (e.g., https://github.com/modelcontextprotocol/server-filesystem)
- npm/pip installation commands (e.g., npx -y @modelcontextprotocol/server-filesystem)
- Documentation snippets or README files
- Partial or complete JSON configuration examples

OUTPUT SCHEMA:
You must return a JSON object with this exact structure:

{
  "name": "string",        // Short identifier (e.g., "filesystem", "github", "time")
  "type": "stdio",         // Transport type: "stdio", "http", or "sse" (default: "stdio")
  "command": "string",     // Executable: "npx", "uvx", "node", "python", etc.
  "args": ["string"],      // Array of command arguments
  "env": {}                // Object with environment variables (use placeholders for secrets)
}

SECURITY RULES:
1. NEVER include actual API keys, tokens, or passwords
2. Replace sensitive values with uppercase placeholders:
   - API keys: "YOUR_API_KEY_HERE"
   - Tokens: "YOUR_TOKEN_HERE"
   - Passwords: "YOUR_PASSWORD_HERE"
3. If env variables are mentioned but no value given, use appropriate placeholder

EXTRACTION RULES:
1. Name: Derive from package name (remove @org/ prefix, remove "server-" or "mcp-" prefix)
2. Type: Always "stdio" unless HTTP/SSE is explicitly mentioned
3. Command: Common values: "npx" (Node.js), "uvx" (Python), "node", "python"
4. Args: Include package name with flags (e.g., ["-y", "@org/package"])
5. Env: Only include if explicitly mentioned in the text

REAL-WORLD EXAMPLES:

Example 1 - NPM Package (stdio):
{
  "name": "filesystem",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"],
  "env": {}
}

Example 2 - Python Package (stdio):
{
  "name": "time",
  "type": "stdio",
  "command": "uvx",
  "args": ["mcp-server-time", "--local-timezone", "Europe/Madrid"],
  "env": {}
}

Example 3 - With Environment Variables:
{
  "name": "github",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_TOKEN": "YOUR_GITHUB_TOKEN_HERE"
  }
}

Example 4 - With API Key:
{
  "name": "context7",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@upstash/context7-mcp"],
  "env": {
    "CONTEXT7_API_KEY": "YOUR_API_KEY_HERE"
  }
}

ERROR HANDLING:
If you cannot extract valid configuration, return:
{
  "error": "Brief explanation of what went wrong",
  "suggestion": "Specific guidance for the user (e.g., 'Please provide the GitHub repository URL or installation command')"
}

Return ONLY the JSON object, no markdown formatting, no explanation text.`;
  }

  /**
   * Extract MCP configuration from text using AI
   */
  async extractConfig(input: ExtractionInput): Promise<ExtractionResult> {
    try {
      logger.aiSdk.info('Starting MCP config extraction', {
        provider: input.userProvider,
        model: input.userModel,
        textLength: input.text.length,
      });

      // Check if model supports structured output
      if (!this.supportsStructuredOutput(input.userProvider, input.userModel)) {
        return {
          success: false,
          error: 'Model not supported',
          suggestion: `The model "${input.userModel}" doesn't support structured output. Please use one of these models: ${this.getSupportedModels()
            .map(p => `${p.provider}: ${p.models.join(', ')}`)
            .join('; ')}`,
        };
      }

      // Create provider
      const provider = this.createProvider(input.userProvider, input.apiKey);
      const model = provider(input.userModel);

      // Try to extract config
      // @ts-ignore - Zod schema inference causes type instantiation depth issues
      const result = await generateObject({
        model,
        schema: MCPConfigSchema,
        prompt: `Extract MCP configuration from:\n\n${input.text}`,
        system: this.getSystemPrompt(),
      });

      const extractedConfig: ExtractedConfig = {
        name: result.object.name,
        type: result.object.type,
        command: result.object.command,
        args: result.object.args,
        env: result.object.env,
      };

      logger.aiSdk.info('Extraction successful', {
        extractedName: extractedConfig.name,
        extractedType: extractedConfig.type,
      });

      return {
        success: true,
        config: extractedConfig,
      };

    } catch (error) {
      logger.aiSdk.error('Extraction failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Try to extract error information if AI returned structured error
      if (error instanceof Error && error.message.includes('error')) {
        try {
          const errorResult = await this.extractError(input);
          if (errorResult) {
            return {
              success: false,
              error: errorResult.error,
              suggestion: errorResult.suggestion,
            };
          }
        } catch {
          // Ignore error extraction failure, use default message
        }
      }

      return {
        success: false,
        error: 'Failed to extract configuration',
        suggestion: 'Try providing more context, such as the full installation command or README section.',
      };
    }
  }

  /**
   * Try to extract structured error information
   */
  private async extractError(input: ExtractionInput): Promise<{ error: string; suggestion: string } | null> {
    try {
      const provider = this.createProvider(input.userProvider, input.apiKey);
      const model = provider(input.userModel);

      // @ts-ignore - Zod schema inference causes type instantiation depth issues
      const result = await generateObject({
        model,
        schema: ErrorSchema,
        prompt: `I couldn't extract MCP configuration from this text:\n\n${input.text}\n\nExplain what went wrong and suggest what the user should provide instead.`,
      });

      return {
        error: result.object.error,
        suggestion: result.object.suggestion,
      };
    } catch {
      return null;
    }
  }
}

export const mcpExtractionService = new MCPExtractionService();
