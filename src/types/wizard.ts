/**
 * Wizard and API validation types
 * Shared between main and renderer processes
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  modelsCount?: number;
}

export interface ProviderValidationConfig {
  type: 'openrouter' | 'gateway' | 'local' | 'openai' | 'anthropic' | 'google';
  apiKey?: string;
  endpoint?: string;
}
