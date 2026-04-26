/**
 * useWebPreview hook
 *
 * Subscribes to port detection events and task status changes
 * to keep the side panel store in sync.
 */

import { useEffect } from 'react';
import { useSidePanelStore } from '@/stores/sidePanelStore';

interface RunningTaskSnapshot {
  id: string;
  detectedPort: number | null;
  command: string;
  description?: string;
}

export function useWebPreview() {
  const addServerTab = useSidePanelStore((state) => state.addServerTab);
  const removeServerTab = useSidePanelStore((state) => state.removeServerTab);

  useEffect(() => {
    const unsubscribe = window.levante.tasks.onPortDetected((data) => {
      addServerTab({
        id: data.taskId,
        port: data.port,
        url: `http://localhost:${data.port}`,
        command: data.command,
        description: data.description,
        detectedAt: Date.now(),
        isAlive: true,
      });
    });

    return unsubscribe;
  }, [addServerTab]);

  // Reconcile with running tasks and remove finished server tabs.
  useEffect(() => {
    let mounted = true;

    const reconcileServers = async () => {
      try {
        const result = await window.levante.tasks.list({ status: 'running' });
        if (!mounted || !result.success) return;

        const runningTasks = Array.isArray(result.data)
          ? (result.data as RunningTaskSnapshot[])
          : [];

        const runningTaskIds = new Set(runningTasks.map((task) => task.id));

        const serverTabs = useSidePanelStore.getState().getServerTabs();
        const existingServerIds = new Set(serverTabs.map((server) => server.id));

        // Rebuild preview tabs from running tasks when the push event was missed.
        for (const task of runningTasks) {
          if (task.detectedPort === null || existingServerIds.has(task.id)) {
            continue;
          }

          addServerTab({
            id: task.id,
            port: task.detectedPort,
            url: `http://localhost:${task.detectedPort}`,
            command: task.command,
            description: task.description,
            detectedAt: Date.now(),
            isAlive: true,
          });
        }

        for (const server of serverTabs) {
          if (!runningTaskIds.has(server.id)) {
            removeServerTab(server.id);
          }
        }
      } catch {
        // Ignore transient IPC errors; next interval retries.
      }
    };

    void reconcileServers();
    const intervalId = window.setInterval(() => {
      void reconcileServers();
    }, 3000);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [addServerTab, removeServerTab]);
}
