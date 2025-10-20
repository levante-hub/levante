import { useState } from 'react';
import { WizardStep } from '@/components/onboarding/WizardStep';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { McpStep } from '@/components/onboarding/McpStep';
import { ProviderStep } from '@/components/onboarding/ProviderStep';
import { DirectoryStep } from '@/components/onboarding/DirectoryStep';
import { CompletionStep } from '@/components/onboarding/CompletionStep';
import { useModelStore } from '@/stores/modelStore';
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
  const { updateProvider, setActiveProvider, syncProviderModels } = useModelStore();

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

  const handleNext = async () => {
    // Special handling for provider step - must validate before proceeding
    if (currentStep === 3 && validationStatus !== 'valid') {
      return;
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);

      // Mark wizard as in progress on first next
      if (currentStep === 1) {
        try {
          await window.levante.wizard.start();
        } catch (error) {
          console.error('Failed to mark wizard as in progress:', error);
        }
      }
    } else {
      // Complete wizard and navigate to chat
      await handleComplete();
    }
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
    } catch (error) {
      console.error('Failed to save provider config:', error);
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
    // Step 3 (Provider) requires validation
    if (currentStep === 3) {
      return !selectedProvider || validationStatus !== 'valid';
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
      {currentStep === 1 && <WelcomeStep />}
      {currentStep === 2 && <McpStep />}
      {currentStep === 3 && (
        <ProviderStep
          selectedProvider={selectedProvider}
          apiKey={apiKey}
          endpoint={endpoint}
          validationStatus={validationStatus}
          validationError={validationError}
          onProviderChange={handleProviderChange}
          onApiKeyChange={setApiKey}
          onEndpointChange={setEndpoint}
          onValidate={handleValidateProvider}
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
