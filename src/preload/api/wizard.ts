import { ipcRenderer } from 'electron';
import type { WizardCompletionData, ProviderValidationConfig } from '../types';

export const wizardApi = {
  checkStatus: () =>
    ipcRenderer.invoke('levante/wizard/check-status'),

  start: () =>
    ipcRenderer.invoke('levante/wizard/start'),

  complete: (data: WizardCompletionData) =>
    ipcRenderer.invoke('levante/wizard/complete', data),

  reset: () =>
    ipcRenderer.invoke('levante/wizard/reset'),

  validateProvider: (config: ProviderValidationConfig) =>
    ipcRenderer.invoke('levante/wizard/validate-provider', config)
};
