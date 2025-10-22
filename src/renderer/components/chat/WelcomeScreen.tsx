import { cn } from '@/lib/utils';
import { useThemeDetector } from '@/hooks/useThemeDetector';
import { useTranslation } from 'react-i18next';
// @ts-ignore - SVG import
import logoNegro from '@/assets/icons/logo_negro.svg';
// @ts-ignore - SVG import
import logoBlanco from '@/assets/icons/logo_blanco.svg';

interface WelcomeScreenProps {
  userName?: string;
  className?: string;
}

export const WelcomeScreen = ({ userName = 'User', className }: WelcomeScreenProps) => {
  const theme = useThemeDetector();
  const { t } = useTranslation('chat');
  const logoSvg = theme === 'dark' ? logoBlanco : logoNegro;

  return (
    <div className={cn("flex flex-col items-center justify-center h-full", className)}>
      <div className="flex items-center gap-3 mb-2">
        <img
          src={logoSvg}
          alt={t('common:app.name')}
          className="w-8 h-8"
        />
        <h1 className="text-3xl font-serif text-foreground/80">
          {t('welcome.greeting', { userName })}
        </h1>
      </div>
    </div>
  );
};
