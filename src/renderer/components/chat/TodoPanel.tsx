import { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { useTodoStore } from '@/stores/todoStore';
import { cn } from '@/lib/utils';
import { useThemeDetector } from '@/hooks/useThemeDetector';
// @ts-ignore - SVG import
import logoNegro from '@/assets/icons/logo_negro.svg';
// @ts-ignore - SVG import
import logoBlanco from '@/assets/icons/logo_blanco.svg';

export function InlineTodoList() {
  const theme = useThemeDetector();
  const logoSvg = theme === 'dark' ? logoBlanco : logoNegro;
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());
  const todos = useTodoStore((s) => s.todos);
  const previousTodos = useTodoStore((s) => s.previousTodos);

  useEffect(() => {
    const currentIds = new Set(todos.map((t) => t.id));
    const removed = previousTodos.filter(
      (t) => t.status === 'completed' && !currentIds.has(t.id)
    );
    if (removed.length === 0) return;

    setFadingIds(new Set(removed.map((t) => t.id)));
    const timer = setTimeout(() => setFadingIds(new Set()), 500);
    return () => clearTimeout(timer);
  }, [todos, previousTodos]);

  const fadingTodos = previousTodos.filter((t) => fadingIds.has(t.id));
  const visibleTodos = [...todos, ...fadingTodos];

  if (visibleTodos.length === 0) return null;

  return (
    <div className="space-y-1 py-2 pl-4 pr-2 animate-[fade-slide-in_300ms_ease-out]">
      {visibleTodos.map((todo) => (
        <div
          key={todo.id}
          className={cn(
            'flex items-center gap-2 text-sm transition-all duration-300',
            todo.status === 'completed' && 'text-muted-foreground line-through',
            fadingIds.has(todo.id) && 'opacity-0 -translate-y-1 duration-500'
          )}
        >
          {todo.status === 'completed' && (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
          )}
          {todo.status === 'in_progress' && (
            <img
              src={logoSvg}
              alt="Working"
              className="h-4 w-4 shrink-0 animate-[breathe_2s_ease-in-out_infinite]"
            />
          )}
          {todo.status === 'pending' && (
            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">
            {todo.status === 'in_progress' && todo.activeForm
              ? todo.activeForm
              : todo.subject}
          </span>
        </div>
      ))}
    </div>
  );
}
