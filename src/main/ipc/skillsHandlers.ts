/**
 * Skills IPC Handlers
 * 
 * Handles IPC communication for the skills system.
 */

import { ipcMain } from 'electron';
import { skillsService } from '../services/skills';
import { getLogger } from '../services/logging';

const logger = getLogger();

export function registerSkillsHandlers(): void {
  logger.core.debug('Registering skills IPC handlers');

  // List all skills
  ipcMain.handle('levante/skills/list', async () => {
    try {
      const skills = skillsService.getSkills();
      return { success: true, data: skills };
    } catch (error) {
      logger.core.error('Failed to list skills', {
        error: error instanceof Error ? error.message : error
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to list skills' 
      };
    }
  });

  // Get a single skill
  ipcMain.handle('levante/skills/get', async (_, id: string) => {
    try {
      const skill = skillsService.getSkill(id);
      if (!skill) {
        return { success: false, error: 'Skill not found' };
      }
      return { success: true, data: skill };
    } catch (error) {
      logger.core.error('Failed to get skill', {
        id,
        error: error instanceof Error ? error.message : error
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get skill' 
      };
    }
  });

  // Get enabled skills
  ipcMain.handle('levante/skills/enabled', async () => {
    try {
      const skills = skillsService.getEnabledSkills();
      return { success: true, data: skills };
    } catch (error) {
      logger.core.error('Failed to get enabled skills', {
        error: error instanceof Error ? error.message : error
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get enabled skills' 
      };
    }
  });

  // Enable a skill
  ipcMain.handle('levante/skills/enable', async (_, id: string) => {
    try {
      const result = await skillsService.enableSkill(id);
      return { success: result };
    } catch (error) {
      logger.core.error('Failed to enable skill', {
        id,
        error: error instanceof Error ? error.message : error
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to enable skill' 
      };
    }
  });

  // Disable a skill
  ipcMain.handle('levante/skills/disable', async (_, id: string) => {
    try {
      const result = await skillsService.disableSkill(id);
      return { success: result };
    } catch (error) {
      logger.core.error('Failed to disable skill', {
        id,
        error: error instanceof Error ? error.message : error
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to disable skill' 
      };
    }
  });

  // Toggle a skill
  ipcMain.handle('levante/skills/toggle', async (_, id: string) => {
    try {
      const result = await skillsService.toggleSkill(id);
      return { success: result };
    } catch (error) {
      logger.core.error('Failed to toggle skill', {
        id,
        error: error instanceof Error ? error.message : error
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to toggle skill' 
      };
    }
  });

  // Refresh skills (re-discover)
  ipcMain.handle('levante/skills/refresh', async () => {
    try {
      const skills = await skillsService.refresh();
      return { success: true, data: skills };
    } catch (error) {
      logger.core.error('Failed to refresh skills', {
        error: error instanceof Error ? error.message : error
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to refresh skills' 
      };
    }
  });

  // Get skills path
  ipcMain.handle('levante/skills/path', async () => {
    try {
      const path = skillsService.getSkillsPath();
      return { success: true, data: path };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get skills path' 
      };
    }
  });

  // Validate a skill
  ipcMain.handle('levante/skills/validate', async (_, id: string) => {
    try {
      const skill = skillsService.getSkill(id);
      if (!skill) {
        return { success: false, error: 'Skill not found' };
      }
      const result = skillsService.validateSkill(skill);
      return { success: true, data: result };
    } catch (error) {
      logger.core.error('Failed to validate skill', {
        id,
        error: error instanceof Error ? error.message : error
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to validate skill' 
      };
    }
  });

  logger.core.debug('Skills IPC handlers registered');
}
