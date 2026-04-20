import { ipcRenderer, webUtils } from 'electron';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  Project,
  ChatSession,
  DatabaseResult,
} from '../../types/database';

export const projectsApi = {
  create: (input: CreateProjectInput): Promise<DatabaseResult<Project>> =>
    ipcRenderer.invoke('levante/projects/create', input),
  get: (id: string): Promise<DatabaseResult<Project | null>> =>
    ipcRenderer.invoke('levante/projects/get', id),
  list: (): Promise<DatabaseResult<Project[]>> =>
    ipcRenderer.invoke('levante/projects/list'),
  update: (input: UpdateProjectInput): Promise<DatabaseResult<Project>> =>
    ipcRenderer.invoke('levante/projects/update', input),
  delete: (id: string): Promise<DatabaseResult<boolean>> =>
    ipcRenderer.invoke('levante/projects/delete', id),
  getSessions: (projectId: string): Promise<DatabaseResult<ChatSession[]>> =>
    ipcRenderer.invoke('levante/projects/sessions', projectId),
  addFiles: (projectId: string): Promise<DatabaseResult<string[]>> =>
    ipcRenderer.invoke('levante/projects/addFiles', projectId),
  addFilesWithPaths: (projectId: string, filePaths: string[]): Promise<DatabaseResult<string[]>> =>
    ipcRenderer.invoke('levante/projects/addFilesWithPaths', projectId, filePaths),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
};
