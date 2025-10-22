import { Globe, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LanguageStepProps {
  selectedLanguage: string;
  detectedLanguage: string;
  onLanguageChange: (language: string) => void;
}

export function LanguageStep({
  selectedLanguage,
  detectedLanguage,
  onLanguageChange,
}: LanguageStepProps) {
  const { t } = useTranslation('wizard');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-primary/10 p-3">
            <Globe className="h-10 w-10 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t('language.title_bilingual')}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t('language.description')}
        </p>
      </div>

      <div className="space-y-4">
        <RadioGroup value={selectedLanguage} onValueChange={onLanguageChange}>
          <div className="flex items-center space-x-3 rounded-lg border p-4 hover:bg-accent/50 transition-colors cursor-pointer">
            <RadioGroupItem value="en" id="lang-en" />
            <Label htmlFor="lang-en" className="flex-1 cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">English</p>
                  <p className="text-sm text-muted-foreground">International</p>
                </div>
                {detectedLanguage === 'en' && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                    {t('language.detected')}
                  </span>
                )}
              </div>
            </Label>
          </div>

          <div className="flex items-center space-x-3 rounded-lg border p-4 hover:bg-accent/50 transition-colors cursor-pointer">
            <RadioGroupItem value="es" id="lang-es" />
            <Label htmlFor="lang-es" className="flex-1 cursor-pointer">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Español</p>
                  <p className="text-sm text-muted-foreground">Spanish</p>
                </div>
                {detectedLanguage === 'es' && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                    {t('language.detected')}
                  </span>
                )}
              </div>
            </Label>
          </div>
        </RadioGroup>

        <Alert className="[&>svg]:top-3.5">
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t('language.change_later')}
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
