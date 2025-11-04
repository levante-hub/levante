import { useState, useEffect } from 'react';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

export const useTelemetry = () => {
  const [telemetry, setTelemetry] = useState({
    enabled: false,
    anonymousUsage: false,
    crashReports: false
  });

  const [state, setState] = useState({
    saving: false,
    saved: false,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const telemetryResult = await window.levante.preferences.get('telemetry');
      if (telemetryResult?.data) {
        setTelemetry(telemetryResult.data);
      }
    } catch (error) {
      logger.preferences.error('Error loading telemetry settings', {
        error: error instanceof Error ? error.message : error
      });
    }
  };

  const handleSave = async () => {
    setState({ saving: true, saved: false });

    try {
      await window.levante.preferences.set('telemetry', telemetry);

      setState({ saving: false, saved: true });

      setTimeout(() => {
        setState({ saving: false, saved: false });
      }, 3000);
    } catch (error) {
      logger.preferences.error('Error saving telemetry settings', {
        error: error instanceof Error ? error.message : error
      });
      setState({ saving: false, saved: false });
    }
  };

  return {
    telemetry,
    setTelemetry,
    state,
    handleSave
  };
};
