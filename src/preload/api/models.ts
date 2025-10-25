import { ipcRenderer } from 'electron';

export const modelsApi = {
  fetchOpenRouter: (apiKey?: string) =>
    ipcRenderer.invoke('levante/models/openrouter', apiKey),
  fetchGateway: (apiKey: string, baseUrl?: string) =>
    ipcRenderer.invoke('levante/models/gateway', apiKey, baseUrl),
  fetchLocal: (endpoint: string) =>
    ipcRenderer.invoke('levante/models/local', endpoint),
  fetchOpenAI: (apiKey: string) =>
    ipcRenderer.invoke('levante/models/openai', apiKey),
  fetchGoogle: (apiKey: string) =>
    ipcRenderer.invoke('levante/models/google', apiKey),
  fetchAnthropic: (apiKey: string) =>
    ipcRenderer.invoke('levante/models/anthropic', apiKey),
  fetchGroq: (apiKey: string) =>
    ipcRenderer.invoke('levante/models/groq', apiKey),
  fetchXAI: (apiKey: string) =>
    ipcRenderer.invoke('levante/models/xai', apiKey),
};
