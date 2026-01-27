/**
 * Skills Preload API
 * 
 * Exposes skills functionality to the renderer process.
 */

import { ipcRenderer } from 'electron';
import type { Skill, SkillValidationResult } from '../../types/skills';

export interface SkillsApiResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export const skillsApi = {
  /**
   * List all discovered skills
   */
  list: (): Promise<SkillsApiResult<Skill[]>> => 
    ipcRenderer.invoke('levante/skills/list'),

  /**
   * Get a single skill by ID
   */
  get: (id: string): Promise<SkillsApiResult<Skill>> => 
    ipcRenderer.invoke('levante/skills/get', id),

  /**
   * Get all enabled skills
   */
  getEnabled: (): Promise<SkillsApiResult<Skill[]>> => 
    ipcRenderer.invoke('levante/skills/enabled'),

  /**
   * Enable a skill
   */
  enable: (id: string): Promise<SkillsApiResult> => 
    ipcRenderer.invoke('levante/skills/enable', id),

  /**
   * Disable a skill
   */
  disable: (id: string): Promise<SkillsApiResult> => 
    ipcRenderer.invoke('levante/skills/disable', id),

  /**
   * Toggle a skill's enabled state
   */
  toggle: (id: string): Promise<SkillsApiResult> => 
    ipcRenderer.invoke('levante/skills/toggle', id),

  /**
   * Refresh skills (re-discover from disk)
   */
  refresh: (): Promise<SkillsApiResult<Skill[]>> => 
    ipcRenderer.invoke('levante/skills/refresh'),

  /**
   * Get the skills directory path
   */
  getPath: (): Promise<SkillsApiResult<string>> => 
    ipcRenderer.invoke('levante/skills/path'),

  /**
   * Validate a skill
   */
  validate: (id: string): Promise<SkillsApiResult<SkillValidationResult>> => 
    ipcRenderer.invoke('levante/skills/validate', id),
};
