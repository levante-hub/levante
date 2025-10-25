import { ipcRenderer } from 'electron';
import {
  CreateChatSessionInput,
  CreateMessageInput,
  UpdateChatSessionInput,
  GetMessagesQuery,
  GetChatSessionsQuery,
  DatabaseResult,
  PaginatedResult,
  ChatSession,
  Message
} from '../../types/database';

export const databaseApi = {
  health: () => ipcRenderer.invoke('levante/db/health'),

  sessions: {
    create: (input: CreateChatSessionInput) =>
      ipcRenderer.invoke('levante/db/sessions/create', input),

    get: (id: string) =>
      ipcRenderer.invoke('levante/db/sessions/get', id),

    list: (query?: GetChatSessionsQuery) =>
      ipcRenderer.invoke('levante/db/sessions/list', query || {}),

    update: (input: UpdateChatSessionInput) =>
      ipcRenderer.invoke('levante/db/sessions/update', input),

    delete: (id: string) =>
      ipcRenderer.invoke('levante/db/sessions/delete', id)
  },

  messages: {
    create: (input: CreateMessageInput) =>
      ipcRenderer.invoke('levante/db/messages/create', input),

    list: (query: GetMessagesQuery) =>
      ipcRenderer.invoke('levante/db/messages/list', query),

    search: (searchQuery: string, sessionId?: string, limit?: number) =>
      ipcRenderer.invoke('levante/db/messages/search', searchQuery, sessionId, limit)
  },

  generateTitle: (message: string) =>
    ipcRenderer.invoke('levante/db/generateTitle', message)
};
