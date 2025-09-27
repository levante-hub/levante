import { cn } from '@/lib/utils';

interface BreathingLogoProps {
  className?: string;
}

// @ts-ignore - SVG import
import logoSvg from '@/assets/icons/logo_blanco.svg';

export const BreathingLogo = ({ className }: BreathingLogoProps) => {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="animate-[breathe_2s_ease-in-out_infinite]">
        <img
          src={logoSvg}
          alt="Levante Logo"
          className="w-6 h-6"
          style={{ filter: 'brightness(0) saturate(100%) opacity(0.6)' }}
        />
      </div>
    </div>
  );
};