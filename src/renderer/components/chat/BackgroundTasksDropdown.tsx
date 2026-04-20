import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Square,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  useTaskStore,
  type TaskInfoDTO,
  type TaskStatus,
} from '@/stores/taskStore';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

interface BackgroundTasksDropdownProps {
  className?: string;
}

const statusVariantMap: Record<TaskStatus, BadgeVariant> = {
  running: 'default',
  completed: 'secondary',
  failed: 'destructive',
  killed: 'outline',
};

function getStatusIcon(status: TaskStatus) {
  switch (status) {
    case 'running':
      return <Loader2 size={14} className="animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle2 size={14} className="text-green-500" />;
    case 'failed':
      return <XCircle size={14} className="text-red-500" />;
    case 'killed':
      return <Square size={14} className="text-orange-500" />;
    default:
      return null;
  }
}

function formatClock(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getCommandPreview(command: string): string {
  return command.length > 75 ? `${command.slice(0, 75)}...` : command;
}

export function BackgroundTasksDropdown({ className }: BackgroundTasksDropdownProps) {
  const { t } = useTranslation('chat');
  const [open, setOpen] = useState(false);

  const {
    tasks,
    stats,
    loading,
    error,
    fetchTasks,
    fetchStats,
    killTask,
    loadOutput,
    cleanup,
    selectedTaskId,
    selectedTaskOutput,
    selectTask,
    clearError,
  } = useTaskStore();

  // Fetch stats on mount to show badge immediately
  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // Keep badge updated while dropdown is closed
  useEffect(() => {
    if (open) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchStats();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open, fetchStats]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void fetchTasks();
  }, [open, fetchTasks]);

  useEffect(() => {
    if (!open || stats.running === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchTasks();

      if (selectedTaskId) {
        void loadOutput(selectedTaskId, 100);
      }
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open, stats.running, selectedTaskId, fetchTasks, loadOutput]);

  const handleOutputClick = async (task: TaskInfoDTO) => {
    if (selectedTaskId === task.id) {
      selectTask(null);
      return;
    }

    selectTask(task.id);
    await loadOutput(task.id, 100);
  };

  // Hide the control unless there are active background tasks.
  if (stats.running === 0) {
    return null;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative rounded-lg text-muted-foreground h-8 w-8', className)}
          title={t('background_tasks.title', 'Background tasks')}
          type="button"
        >
          <Activity size={16} />
          {stats.running > 0 && (
            <Badge
              variant="default"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px]"
            >
              {stats.running}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[440px] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <Activity size={16} />
            <span className="text-sm font-medium">
              {t('background_tasks.title', 'Background tasks')}
            </span>
            {stats.running > 0 && (
              <Badge variant="default" className="text-xs">
                {t('background_tasks.running_count', {
                  count: stats.running,
                  defaultValue: '{{count}} running',
                })}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void fetchTasks()}
              disabled={loading}
              title={t('background_tasks.refresh', 'Refresh')}
              type="button"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>

            {stats.total > stats.running && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void cleanup(1)}
                title={t('background_tasks.cleanup', 'Cleanup completed tasks')}
                type="button"
              >
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-2 mt-2 p-2 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-xs flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">
                {t('background_tasks.error_prefix', 'Task error')}
              </p>
              <p className="break-words">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={clearError}
              type="button"
            >
              <X size={12} />
            </Button>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Terminal size={30} className="mb-2 opacity-50" />
            <p className="text-sm">{t('background_tasks.no_tasks', 'No background tasks')}</p>
            <p className="text-xs text-center px-4">
              {t(
                'background_tasks.no_tasks_hint',
                'Tasks started with run_in_background will appear here'
              )}
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[420px] w-full">
            <div className="p-2 space-y-1 w-full">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    'p-2 rounded-md border text-sm overflow-hidden',
                    selectedTaskId === task.id
                      ? 'bg-accent border-primary'
                      : 'hover:bg-accent/50'
                  )}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 mb-1">
                    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                      {getStatusIcon(task.status)}
                      <code
                        className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-mono"
                        title={task.command}
                      >
                        {getCommandPreview(task.command)}
                      </code>
                    </div>
                    <Badge variant={statusVariantMap[task.status]} className="text-xs shrink-0">
                      {t(`background_tasks.status.${task.status}`, task.status)}
                    </Badge>
                  </div>

                  <div className="flex min-w-0 items-center justify-between text-xs text-muted-foreground gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
                      <span>
                        {t('background_tasks.task_id', 'ID')}: {task.id.slice(0, 8)}
                      </span>
                      {task.pid !== null && (
                        <span>
                          {t('background_tasks.pid', 'PID')}: {task.pid}
                        </span>
                      )}
                      <span>
                        {t('background_tasks.started', 'Started')}: {formatClock(task.startedAt)}
                      </span>
                      {task.exitCode !== null && (
                        <span>
                          {t('background_tasks.exit_code', 'Exit')}: {task.exitCode}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => void handleOutputClick(task)}
                        type="button"
                      >
                        <Terminal size={12} className="mr-1" />
                        {selectedTaskId === task.id
                          ? t('background_tasks.hide_output', 'Hide')
                          : t('background_tasks.output', 'Output')}
                      </Button>

                      {task.status === 'running' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => void killTask(task.id)}
                          type="button"
                        >
                          <X size={12} className="mr-1" />
                          {t('background_tasks.kill', 'Kill')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {selectedTaskId === task.id && (
                    <div
                      className="mt-2 p-2 bg-muted rounded text-xs font-mono max-h-40 overflow-auto whitespace-pre-wrap break-all"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {selectedTaskOutput && selectedTaskOutput.length > 0
                        ? selectedTaskOutput
                        : '(no output)'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {tasks.length > 0 && (
          <div className="px-3 py-2 border-t text-xs text-muted-foreground flex flex-wrap items-center gap-3">
            <span>
              {t('background_tasks.total', 'Total')}: {stats.total}
            </span>
            <span className="text-green-600">
              {t('background_tasks.completed', 'Completed')}: {stats.completed}
            </span>
            <span className="text-red-600">
              {t('background_tasks.failed', 'Failed')}: {stats.failed}
            </span>
            <span className="text-orange-600">
              {t('background_tasks.killed', 'Killed')}: {stats.killed}
            </span>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
