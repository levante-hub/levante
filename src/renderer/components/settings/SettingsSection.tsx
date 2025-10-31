import { ReactNode } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

interface SettingsSectionProps {
  icon: ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export const SettingsSection = ({
  icon,
  title,
  defaultOpen = false,
  children
}: SettingsSectionProps) => {
  return (
    <Collapsible defaultOpen={defaultOpen} className="bg-card rounded-lg border-none">
      <div className="p-6">
        <CollapsibleTrigger className="flex items-center justify-between w-full group">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {icon}
            {title}
          </h3>
          <ChevronDown className="w-5 h-5 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4">
          <div className="space-y-6">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
