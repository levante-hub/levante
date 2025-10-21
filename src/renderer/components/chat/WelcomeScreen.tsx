import { cn } from '@/lib/utils';
// @ts-ignore - SVG import
import logoSvg from '@/assets/icons/logo_negro.svg';

interface WelcomeScreenProps {
  userName?: string;
  className?: string;
}

export const WelcomeScreen = ({ userName = 'Oliver', className }: WelcomeScreenProps) => {
  return (
    <div className={cn("flex flex-col items-center justify-center h-full", className)}>
      <div className="flex items-center gap-3 mb-2">
        <img
          src={logoSvg}
          alt="Levante Logo"
          className="w-8 h-8"
          style={{ filter: 'brightness(0) saturate(50%)' }}
        />
        <h1 className="text-3xl font-serif text-foreground/80">
          ¿Qué tal tu día, {userName}?
        </h1>
      </div>
    </div>
  );
};
