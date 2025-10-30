import { useState, useEffect } from 'react';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

export const useAIConfig = () => {
  const [config, setConfig] = useState({
    baseSteps: 5,
    maxSteps: 20,
  });

  const [state, setState] = useState({
    saving: false,
    saved: false
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const aiConfig = await window.levante.preferences.get('ai');
      setConfig(prev => ({
        ...prev,
        baseSteps: aiConfig?.data?.baseSteps || 5,
        maxSteps: aiConfig?.data?.maxSteps || 20
      }));
    } catch (error) {
      logger.preferences.error('Error loading AI steps configuration', {
        error: error instanceof Error ? error.message : error
      });
    }
  };

  const handleSave = async () => {
    setState(prev => ({ ...prev, saving: true, saved: false }));

    try {
      await window.levante.preferences.set('ai', {
        baseSteps: config.baseSteps,
        maxSteps: config.maxSteps
      });

      setState(prev => ({ ...prev, saving: false, saved: true }));

      setTimeout(() => {
        setState(prev => ({ ...prev, saved: false }));
      }, 3000);
    } catch (error) {
      logger.preferences.error('Error saving AI steps configuration', {
        baseSteps: config.baseSteps,
        maxSteps: config.maxSteps,
        error: error instanceof Error ? error.message : error
      });
      setState(prev => ({ ...prev, saving: false }));
    }
  };

  return {
    config,
    setConfig,
    state,
    handleSave
  };
};
