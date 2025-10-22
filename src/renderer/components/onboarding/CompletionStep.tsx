import { CheckCircle2, Sparkles, Settings2, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CompletionStepProps {
  providerName: string;
}

export function CompletionStep({ providerName }: CompletionStepProps) {
  const { t } = useTranslation('wizard');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-green-500/10 p-3">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{t('completion.title')}</h2>
        <p className="mt-2 text-muted-foreground">
          {t('completion.subtitle')}{' '}
          <span className="font-semibold text-foreground">{providerName}</span>
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/50 p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('completion.whats_next')}
          </h3>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                1
              </span>
              <span>{t('completion.steps.select_models')}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                2
              </span>
              <span>{t('completion.steps.start_chatting')}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                3
              </span>
              <span>{t('completion.steps.explore_mcp')}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                4
              </span>
              <span>{t('completion.steps.customize_settings')}</span>
            </li>
          </ol>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Settings2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-sm">
              <p className="font-medium">{t('completion.tips.switch_providers.title')}</p>
              <p className="text-muted-foreground text-xs">
                {t('completion.tips.switch_providers.location')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Zap className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="text-sm">
              <p className="font-medium">{t('completion.tips.add_providers.title')}</p>
              <p className="text-muted-foreground text-xs">
                {t('completion.tips.add_providers.description')}
              </p>
            </div>
          </div>
        </div>

        <div className="text-center pt-4">
          <p className="text-sm text-muted-foreground">
            {t('completion.ready_message')}
          </p>
        </div>
      </div>
    </div>
  );
}
