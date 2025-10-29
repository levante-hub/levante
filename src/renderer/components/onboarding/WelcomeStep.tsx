import { Shield, Database, Zap, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface WelcomeStepProps {
  selectedLanguage: 'en' | 'es';
  detectedLanguage: 'en' | 'es';
  onLanguageChange: (language: 'en' | 'es') => void;
}

export function WelcomeStep({
  selectedLanguage,
  detectedLanguage,
  onLanguageChange,
}: WelcomeStepProps) {
  const { t } = useTranslation('wizard');

  return (
    <div className="space-y-6">

      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t('welcome.title')}</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          {t('welcome.subtitle')}
        </p>
      </div>

      <div className="mt-8 space-y-4">
        <p className="text-center text-muted-foreground">
          {t('welcome.description')}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Lock className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div>
              <h3 className="font-semibold">{t('welcome.features.privacy.title')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('welcome.features.privacy.description')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Zap className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div>
              <h3 className="font-semibold">{t('welcome.features.multi_provider.title')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('welcome.features.multi_provider.description')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Database className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div>
              <h3 className="font-semibold">{t('welcome.features.local_storage.title')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('welcome.features.local_storage.description')}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Shield className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div>
              <h3 className="font-semibold">{t('welcome.features.mcp_support.title')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('welcome.features.mcp_support.description')}
              </p>
            </div>
          </div>
        </div>

        {/* Language Selector */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-muted-foreground">{t('language.select_language')}:</span>
          <Select value={selectedLanguage} onValueChange={onLanguageChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">
                <div className="flex items-center justify-between w-full gap-2">
                  <span>English</span>
                  {detectedLanguage === 'en' && (
                    <span className="text-xs text-primary">({t('language.detected')})</span>
                  )}
                </div>
              </SelectItem>
              <SelectItem value="es">
                <div className="flex items-center justify-between w-full gap-2">
                  <span>Español</span>
                  {detectedLanguage === 'es' && (
                    <span className="text-xs text-primary">({t('language.detected')})</span>
                  )}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-center text-sm text-muted-foreground pt-4">
          {t('welcome.get_started')}
        </p>
      </div>
    </div>
  );
}
