import { useState, useEffect } from 'react';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

export const useSecurity = () => {
  const [security, setSecurity] = useState({
    encryptApiKeys: false
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
      const securityResult = await window.levante.preferences.get('security');
      if (securityResult?.data) {
        setSecurity(securityResult.data);
      }
    } catch (error) {
      logger.preferences.error('Error loading security settings', {
        error: error instanceof Error ? error.message : error
      });
    }
  };

  const handleSave = async () => {
    setState({ saving: true, saved: false });

    try {
      await window.levante.preferences.set('security', security);

      setState({ saving: false, saved: true });

      setTimeout(() => {
        setState({ saving: false, saved: false });
      }, 3000);
    } catch (error) {
      logger.preferences.error('Error saving security settings', {
        error: error instanceof Error ? error.message : error
      });
      setState({ saving: false, saved: false });
    }
  };

  return {
    security,
    setSecurity,
    state,
    handleSave
  };
};
