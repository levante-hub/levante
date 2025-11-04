import {
  PersonalizationSection,
  AppearanceSection,
  SecuritySection,
  TelemetrySection,
  AIConfigSection
} from '@/components/settings';

const SettingsPage = () => {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6 px-4 mb-10">
        <PersonalizationSection />
        <AppearanceSection />
        <SecuritySection />
        <TelemetrySection />
        <AIConfigSection />
      </div>
    </div>
  );
};

export default SettingsPage;