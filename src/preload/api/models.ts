import { ipcRenderer } from 'electron';

export const modelsApi = {
  fetchOpenRouter: (apiKey?: string) =>
    ipcRenderer.invoke('levante/models/openrouter', apiKey),
  fetchGateway: (apiKey: string, baseUrl?: string) =>
    ipcRenderer.invoke('levante/models/gateway', apiKey, baseUrl),
  fetchLocal: (endpoint: string, apiKey?: string) =>
    ipcRenderer.invoke('levante/models/local', endpoint, apiKey),
  fetchOpenAI: (
    params:
      | string
      | { apiKey?: string; authMode?: 'api-key' | 'oauth'; organizationId?: string }
  ) =>
    ipcRenderer.invoke('levante/models/openai', params),
  fetchGoogle: (apiKey: string) =>
    ipcRenderer.invoke('levante/models/google', apiKey),
  fetchAnthropic: (params: { apiKey?: string; authMode?: 'api-key' | 'oauth' }) =>
    ipcRenderer.invoke('levante/models/anthropic', params),
  fetchGroq: (apiKey: string) =>
    ipcRenderer.invoke('levante/models/groq', apiKey),
  fetchXAI: (apiKey: string) =>
    ipcRenderer.invoke('levante/models/xai', apiKey),
  fetchHuggingFace: (apiKey: string) =>
    ipcRenderer.invoke('levante/models/huggingface', apiKey),
  validateHuggingFaceModel: (modelId: string, inferenceProvider: string) =>
    ipcRenderer.invoke('levante/models/huggingface/validate', modelId, inferenceProvider),
  // Levante Platform uses OAuth tokens instead of API keys
  // baseUrl is optional - defaults to https://platform.levante.ai
  fetchLevantePlatform: (baseUrl?: string) =>
    ipcRenderer.invoke('levante/models/levante-platform', baseUrl),
};
