import { cn } from '@/lib/utils';
import { useThemeDetector } from '@/hooks/useThemeDetector';
// @ts-ignore - SVG import
import logoNegro from '@/assets/icons/logo_negro.svg';
// @ts-ignore - SVG import
import logoBlanco from '@/assets/icons/logo_blanco.svg';

interface BreathingLogoProps {
  className?: string;
}

export const BreathingLogo = ({ className }: BreathingLogoProps) => {
  const theme = useThemeDetector();
  const logoSvg = theme === 'dark' ? logoBlanco : logoNegro;

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="animate-[breathe_2s_ease-in-out_infinite]">
        <img
          src={logoSvg}
          alt="Levante Logo"
          className="w-6 h-6 opacity-60"
        />
      </div>
    </div>
  );
};