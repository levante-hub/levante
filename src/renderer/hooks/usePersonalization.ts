import { useState, useEffect } from 'react';
import { getRendererLogger } from '@/services/logger';
import type { PersonalizationSettings } from '../../types/userProfile';

const logger = getRendererLogger();

export const usePersonalization = () => {
  const [personalization, setPersonalization] = useState<PersonalizationSettings>({
    enabled: false,
    personality: 'default',
    customInstructions: '',
    nickname: '',
    occupation: '',
    aboutUser: '',
  });

  const [state, setState] = useState({
    saving: false,
    saved: false,
  });

  useEffect(() => {
    loadPersonalization();
  }, []);

  const loadPersonalization = async () => {
    try {
      const profile = await window.levante.profile.get();
      if (profile?.data?.personalization) {
        setPersonalization(profile.data.personalization);
      }
    } catch (error) {
      logger.preferences.error('Error loading personalization settings', {
        error: error instanceof Error ? error.message : error
      });
    }
  };

  const handleSave = async () => {
    setState({ saving: true, saved: false });

    try {
      await window.levante.profile.update({
        personalization
      });

      setState({ saving: false, saved: true });

      setTimeout(() => {
        setState({ saving: false, saved: false });
      }, 3000);
    } catch (error) {
      logger.preferences.error('Error saving personalization settings', {
        error: error instanceof Error ? error.message : error
      });
      setState({ saving: false, saved: false });
    }
  };

  return {
    personalization,
    setPersonalization,
    state,
    handleSave
  };
};
