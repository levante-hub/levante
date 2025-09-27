import { cn } from '@/lib/utils';

interface TypingDotsProps {
  className?: string;
}

export const TypingDots = ({ className }: TypingDotsProps) => {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce"></div>
      </div>
    </div>
  );
};