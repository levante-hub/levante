import { Shield, AlertTriangle, HelpCircle } from 'lucide-react';
import type { TrustLevel } from '@/constants/mcpSecurity';
import { cn } from '@/lib/utils';

interface TrustBadgeProps {
  trustLevel: TrustLevel;
  className?: string;
}

export function TrustBadge({ trustLevel, className }: TrustBadgeProps) {
  const badges = {
    'verified-official': {
      icon: Shield,
      text: 'Verified Official',
      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800'
    },
    'community': {
      icon: AlertTriangle,
      text: 'Community Package',
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
    },
    'unknown': {
      icon: HelpCircle,
      text: 'Unknown Source',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800'
    }
  };

  const badge = badges[trustLevel];
  const Icon = badge.icon;

  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium',
      badge.className,
      className
    )}>
      <Icon className="w-3.5 h-3.5" />
      {badge.text}
    </div>
  );
}
