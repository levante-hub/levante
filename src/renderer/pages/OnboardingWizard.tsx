import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { WizardStep } from '@/components/onboarding/WizardStep';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { McpStep } from '@/components/onboarding/McpStep';
import { ProviderStep } from '@/components/onboarding/ProviderStep';
import { DirectoryStep } from '@/components/onboarding/DirectoryStep';
import { CompletionStep } from '@/components/onboarding/CompletionStep';
import { useModelStore } from '@/stores/modelStore';
import { detectSystemLanguage } from '@/i18n/languageDetector';
import type { ProviderValidationConfig } from '../../types/wizard';

const TOTAL_STEPS = 5;

const PROVIDER_NAMES: Record<string, string> = {
  openrouter: 'OpenRouter',
  gateway: 'Vercel AI Gateway',
  local: 'Local Server',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
};

interface OnboardingWizardProps {
  onComplete?: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps = {}) {
  const { updateProvider, setActiveProvider, syncProviderModels, providers } = useModelStore();
  const { i18n } = useTranslation();

  // Language step state
  const [detectedLanguage, setDetectedLanguage] = useState<'en' | 'es'>('en');
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'es'>('en');

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);

  // Provider step state
  const [selectedProvider, setSelectedProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('http://localhost:11434');
  const [validationStatus, setValidationStatus] = useState<
    'idle' | 'validating' | 'valid' | 'invalid'
  >('idle');
  const [validationError, setValidationError] = useState('');

  // Model selection state
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Detect system language on mount
  useEffect(() => {
    const detected = detectSystemLanguage();
    setDetectedLanguage(detected);
    setSelectedLanguage(detected);
    i18n.changeLanguage(detected);
  }, [i18n]);

  // Load models when providers change (after sync)
  useEffect(() => {
    if (selectedProvider && validationStatus === 'valid') {
      // Small delay to ensure store is updated after sync
      const timer = setTimeout(() => {
        loadAvailableModels();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [providers, selectedProvider, validationStatus]);

  const handleNext = async () => {
    // Step 1 (Welcome): Save language selection and start wizard
    if (currentStep === 1) {
      try {
        await window.levante.preferences.set('language', selectedLanguage);
        i18n.changeLanguage(selectedLanguage);
        await window.levante.wizard.start();
      } catch (error) {
        console.error('Failed to save language or start wizard:', error);
      }
    }

    // Step 3 (Provider): Must validate before proceeding
    if (currentStep === 3 && validationStatus !== 'valid') {
      return;
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    } else {
      // Complete wizard and navigate to chat
      await handleComplete();
    }
  };

  const handleLanguageChange = (language: 'en' | 'es') => {
    setSelectedLanguage(language);
    i18n.changeLanguage(language);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    setApiKey('');
    setEndpoint(
      provider === 'local' ? 'http://localhost:11434' : ''
    );
    setValidationStatus('idle');
    setValidationError('');
    setAvailableModels([]);
    setSelectedModel(null);
  };

  const handleModelSelect = async (modelId: string) => {
    setSelectedModel(modelId);
    // Mark this model as selected in the provider configuration
    try {
      await updateProvider(selectedProvider, {
        selectedModelIds: [modelId]
      });
    } catch (error) {
      console.error('Failed to select model:', error);
    }
  };

  const handleValidateProvider = async () => {
    if (!selectedProvider) return;

    setValidationStatus('validating');
    setValidationError('');

    try {
      const config: ProviderValidationConfig = {
        type: selectedProvider as any,
        apiKey: apiKey || undefined,
        endpoint: endpoint || undefined,
      };

      const result = await window.levante.wizard.validateProvider(config);

      if (result.success && result.data?.isValid) {
        setValidationStatus('valid');
        setValidationError('');

        // Save provider configuration
        await saveProviderConfig();
      } else {
        setValidationStatus('invalid');
        setValidationError(
          result.data?.error ||
            result.error ||
            'Validation failed. Please check your credentials.'
        );
      }
    } catch (error) {
      setValidationStatus('invalid');
      setValidationError(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  };

  const saveProviderConfig = async () => {
    try {
      // Build update object based on provider type
      const updates: any = {};

      if (apiKey) {
        updates.apiKey = apiKey;
      }

      // Only add endpoint for specific providers
      if (selectedProvider === 'local' || selectedProvider === 'gateway') {
        updates.baseUrl = endpoint;
      }

      // Update provider with API key/endpoint if we have updates
      if (Object.keys(updates).length > 0) {
        await updateProvider(selectedProvider, updates);
      }

      // Set as active provider
      await setActiveProvider(selectedProvider);

      // Sync models from provider
      await syncProviderModels(selectedProvider);

      // Wait a bit for store to update, then load available models
      setTimeout(() => {
        loadAvailableModels();
      }, 200);
    } catch (error) {
      console.error('Failed to save provider config:', error);
    }
  };

  const loadAvailableModels = () => {
    try {
      // Get provider from store (which is already updated after sync)
      const provider = providers.find((p) => p.id === selectedProvider);
      if (provider && provider.models) {
        // Filter only available models
        const models = provider.models.filter((m) => m.isAvailable);
        setAvailableModels(models);
        console.log('Loaded available models:', models.length);
      } else {
        console.log('No provider or models found', { provider: !!provider, models: provider?.models?.length });
      }
    } catch (error) {
      console.error('Failed to load available models:', error);
    }
  };

  const handleOAuthSuccess = async (newApiKey: string) => {
    // Update state immediately
    setApiKey(newApiKey);

    // Validate with the new API key (passed directly to avoid closure issues)
    setValidationStatus('validating');
    setValidationError('');

    try {
      const config: ProviderValidationConfig = {
        type: selectedProvider as any,
        apiKey: newApiKey, // Use the passed key directly, not from state
        endpoint: endpoint || undefined,
      };

      const result = await window.levante.wizard.validateProvider(config);

      if (result.success && result.data?.isValid) {
        setValidationStatus('valid');
        setValidationError('');

        // Save provider configuration with the new API key
        const updates: any = { apiKey: newApiKey };

        // Only add endpoint for specific providers
        if (selectedProvider === 'local' || selectedProvider === 'gateway') {
          updates.baseUrl = endpoint;
        }

        // Update provider
        await updateProvider(selectedProvider, updates);

        // Set as active provider
        await setActiveProvider(selectedProvider);

        // Sync models from provider
        await syncProviderModels(selectedProvider);

        // Wait a bit for store to update, then load available models
        setTimeout(() => {
          loadAvailableModels();
        }, 200);
      } else {
        setValidationStatus('invalid');
        setValidationError(
          result.data?.error ||
            result.error ||
            'Validation failed. Please check your credentials.'
        );
      }
    } catch (error) {
      setValidationStatus('invalid');
      setValidationError(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    }
  };

  const handleComplete = async () => {
    try {
      // Complete wizard
      await window.levante.wizard.complete({
        provider: selectedProvider,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });

      // Call onComplete callback to reload app
      if (onComplete) {
        onComplete();
      } else {
        // Fallback: reload window
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to complete wizard:', error);
    }
  };

  const getNextButtonLabel = () => {
    if (currentStep === TOTAL_STEPS) {
      return 'Start Using Levante';
    }
    return 'Next';
  };

  const isNextDisabled = () => {
    // Step 3 (Provider) requires validation and model selection
    if (currentStep === 3) {
      return !selectedProvider || validationStatus !== 'valid' || !selectedModel;
    }
    return false;
  };

  return (
    <WizardStep
      currentStep={currentStep}
      totalSteps={TOTAL_STEPS}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel={getNextButtonLabel()}
      nextDisabled={isNextDisabled()}
    >
      {currentStep === 1 && (
        <WelcomeStep
          selectedLanguage={selectedLanguage}
          detectedLanguage={detectedLanguage}
          onLanguageChange={handleLanguageChange}
        />
      )}
      {currentStep === 2 && <McpStep />}
      {currentStep === 3 && (
        <ProviderStep
          selectedProvider={selectedProvider}
          apiKey={apiKey}
          endpoint={endpoint}
          validationStatus={validationStatus}
          validationError={validationError}
          availableModels={availableModels}
          selectedModel={selectedModel}
          onProviderChange={handleProviderChange}
          onApiKeyChange={setApiKey}
          onEndpointChange={setEndpoint}
          onValidate={handleValidateProvider}
          onModelSelect={handleModelSelect}
          onOAuthSuccess={handleOAuthSuccess}
        />
      )}
      {currentStep === 4 && <DirectoryStep />}
      {currentStep === 5 && (
        <CompletionStep
          providerName={PROVIDER_NAMES[selectedProvider] || selectedProvider}
        />
      )}
    </WizardStep>
  );
}
