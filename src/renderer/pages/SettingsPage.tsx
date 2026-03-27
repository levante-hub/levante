import { useEffect, useState } from 'react';
import {
  PersonalizationSection,
  AppearanceSection,
  SecuritySection,
  PrivacySection,
  AIConfigSection,
  ReasoningSection,
  DeveloperModeSection,
  RuntimesSection,
  MCPSection,
  OriginsSection
} from '@/components/settings';
import { usePlatformStore } from '@/stores/platformStore';
import { usePreference } from '@/hooks/usePreferences';

const SettingsPage = () => {
  const [developerMode, setDeveloperMode] = useState(false);
  const appMode = usePlatformStore((s) => s.appMode);
  const isPlatformMode = appMode === 'platform';
  const [useOtherProviders] = usePreference('useOtherProviders');
  const showSecuritySection = !isPlatformMode || useOtherProviders === true;

  useEffect(() => {
    const loadMode = async () => {
      const result = await window.levante.preferences.get('developerMode');
      if (result.success) {
        setDeveloperMode(result.data ?? false);
      }
    };
    loadMode();

    // Listen for changes in developer mode
    const handlePreferenceChange = (event: CustomEvent) => {
      if (event.detail?.key === 'developerMode') {
        setDeveloperMode(event.detail.value);
      }
    };

    window.addEventListener('preference-changed', handlePreferenceChange as EventListener);
    return () => window.removeEventListener('preference-changed', handlePreferenceChange as EventListener);
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6 px-4 mb-10">
        <PersonalizationSection />
        <AppearanceSection />
        {showSecuritySection && <SecuritySection />}
        <PrivacySection />
        <AIConfigSection />
        <ReasoningSection />
        <DeveloperModeSection />
        {developerMode && <RuntimesSection />}
        <MCPSection />
        <OriginsSection />
      </div>
    </div>
  );
};

export default SettingsPage;
