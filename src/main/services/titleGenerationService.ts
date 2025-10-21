import { AIService } from './aiService';
import { UIMessage } from 'ai';
import { getLogger } from './logging';

export class TitleGenerationService {
  private logger = getLogger();
  private aiService: AIService;
  
  constructor() {
    this.aiService = new AIService();
  }

  async generateTitle(firstUserMessage: string): Promise<string> {
    this.logger.aiSdk.debug("Generating title for message", { 
      messagePreview: firstUserMessage.substring(0, 100) + '...',
      messageLength: firstUserMessage.length 
    });
    
    try {
      // Create a focused prompt for title generation
      const titlePrompt: UIMessage[] = [
        {
          id: 'system',
          role: 'system',
          parts: [{
            type: 'text',
            text: `You are a helpful assistant that creates short, descriptive titles for chat conversations.

Rules:
- Create a concise title (2-6 words maximum)  
- Focus on the main topic or intent
- Use title case (capitalize important words)
- Be specific but not overly technical
- No quotes, punctuation, or special characters
- If it's a greeting/hello, use "General Chat"
- If it's code-related, mention the language/technology
- If it's a question, focus on the subject matter

Examples:
- "How do I center a div in CSS?" → "CSS Centering Help"
- "Write a Python function to sort arrays" → "Python Array Sorting"
- "What's the weather like today?" → "Weather Inquiry"
- "Hello, how are you?" → "General Chat"
- "Help me debug this React component" → "React Component Debug"
- "Explain machine learning basics" → "Machine Learning Basics"`
          }]
        },
        {
          id: 'user',
          role: 'user',
          parts: [{
            type: 'text',
            text: `Generate a short title for this message: "${firstUserMessage}"`
          }]
        }
      ];

      // Get the user's currently selected model from preferences
      const { preferencesService } = await import("./preferencesService");
      const activeProviderId = preferencesService.get("activeProvider") as string;
      const providers = (preferencesService.get("providers") as any[]) || [];

      const activeProvider = providers.find(p => p.id === activeProviderId);

      if (!activeProvider) {
        throw new Error("No active provider configured. Please configure a provider in the Models page.");
      }

      // Get the first selected model from the active provider
      let modelId: string | undefined;

      if (activeProvider.modelSource === 'dynamic') {
        // For dynamic providers, get first selectedModelId
        modelId = activeProvider.selectedModelIds?.[0];
      } else {
        // For user-defined providers, get first selected model
        const selectedModel = activeProvider.models?.find((m: any) => m.isSelected !== false);
        modelId = selectedModel?.id;
      }

      if (!modelId) {
        throw new Error("No model selected in active provider. Please select a model in the Models page.");
      }

      this.logger.aiSdk.debug("Using model for title generation", { modelId, providerId: activeProvider.id });

      // Use the user's configured model for title generation
      const response = await this.aiService.sendSingleMessage({
        messages: titlePrompt,
        model: modelId,
        webSearch: false
      });

      let title = response.response?.trim() || '';
      
      // Clean up the title
      title = title.replace(/["']/g, ''); // Remove quotes
      title = title.replace(/[.,!?;:]$/, ''); // Remove trailing punctuation
      title = title.substring(0, 50); // Max 50 characters
      
      // Fallback if title generation fails or is empty
      if (!title || title.length < 3) {
        title = this.generateFallbackTitle(firstUserMessage);
      }

      this.logger.aiSdk.debug("Generated title", { title, originalLength: firstUserMessage.length });
      return title;
      
    } catch (error) {
      this.logger.aiSdk.error("Error generating title", { 
        error: error instanceof Error ? error.message : error,
        messageLength: firstUserMessage.length 
      });
      return this.generateFallbackTitle(firstUserMessage);
    }
  }

  private generateFallbackTitle(message: string): string {
    // Simple rule-based fallback
    const cleanMessage = message.trim().toLowerCase();
    
    // Common patterns
    if (cleanMessage.startsWith('hello') || cleanMessage.startsWith('hi') || cleanMessage.startsWith('hey')) {
      return 'General Chat';
    }
    
    if (cleanMessage.includes('code') || cleanMessage.includes('function') || cleanMessage.includes('script')) {
      return 'Coding Help';
    }
    
    if (cleanMessage.includes('debug') || cleanMessage.includes('error') || cleanMessage.includes('fix')) {
      return 'Debug Session';
    }
    
    if (cleanMessage.startsWith('how') || cleanMessage.startsWith('what') || cleanMessage.startsWith('why')) {
      return 'Help Request';
    }
    
    if (cleanMessage.includes('explain') || cleanMessage.includes('learn') || cleanMessage.includes('teach')) {
      return 'Learning Session';
    }
    
    // Generic fallback - use first few words
    const words = message.trim().split(/\s+/).slice(0, 4);
    let title = words.join(' ');
    
    // Capitalize first letter of each word
    title = title.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    return title.substring(0, 30) || 'New Chat';
  }
}

// Singleton instance
export const titleGenerationService = new TitleGenerationService();