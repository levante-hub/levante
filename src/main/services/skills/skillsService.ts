/**
 * Skills Service
 * 
 * Simple MVP implementation of Agent Skills system.
 * Handles discovery, loading, and management of skills.
 */

import { readdir, readFile, writeFile, stat, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import matter from 'gray-matter';
import { directoryService } from '../directoryService';
import { getLogger } from '../logging';
import type { Skill, SkillMetadata, SkillsConfig, SkillValidationResult } from '../../../types/skills';

const logger = getLogger();

const SKILLS_DIR = 'skills';
const SKILLS_CONFIG_FILE = 'skills-config.json';
const SKILL_FILE = 'SKILL.md';

class SkillsServiceImpl {
  private skills: Map<string, Skill> = new Map();
  private config: SkillsConfig = { enabledSkills: [], autoSelect: false };
  private initialized = false;

  /**
   * Initialize the skills service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.core.info('Initializing Skills Service');

      // Ensure skills directory exists
      const skillsPath = this.getSkillsPath();
      if (!existsSync(skillsPath)) {
        await mkdir(skillsPath, { recursive: true });
        logger.core.info('Created skills directory', { path: skillsPath });
      }

      // Load configuration
      await this.loadConfig();

      // Discover skills
      await this.discoverSkills();

      this.initialized = true;
      logger.core.info('Skills Service initialized', { 
        skillCount: this.skills.size,
        enabledCount: this.config.enabledSkills.length 
      });
    } catch (error) {
      logger.core.error('Failed to initialize Skills Service', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Get the skills directory path
   */
  getSkillsPath(): string {
    return directoryService.getSubdirPath(SKILLS_DIR);
  }

  /**
   * Get the skills config file path
   */
  private getConfigPath(): string {
    return join(directoryService.getBaseDir(), SKILLS_CONFIG_FILE);
  }

  /**
   * Load skills configuration
   */
  private async loadConfig(): Promise<void> {
    const configPath = this.getConfigPath();
    
    try {
      if (existsSync(configPath)) {
        const content = await readFile(configPath, 'utf-8');
        this.config = JSON.parse(content);
        logger.core.debug('Loaded skills config', { config: this.config });
      }
    } catch (error) {
      logger.core.warn('Failed to load skills config, using defaults', {
        error: error instanceof Error ? error.message : error
      });
      this.config = { enabledSkills: [], autoSelect: false };
    }
  }

  /**
   * Save skills configuration
   */
  private async saveConfig(): Promise<void> {
    const configPath = this.getConfigPath();
    
    try {
      await writeFile(
        configPath,
        JSON.stringify(this.config, null, 2),
        'utf-8'
      );
      logger.core.debug('Saved skills config');
    } catch (error) {
      logger.core.error('Failed to save skills config', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  /**
   * Discover all skills in the skills directory
   */
  async discoverSkills(): Promise<Skill[]> {
    const skillsPath = this.getSkillsPath();
    this.skills.clear();

    try {
      if (!existsSync(skillsPath)) {
        return [];
      }

      const entries = await readdir(skillsPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillPath = join(skillsPath, entry.name);
        const skillFile = join(skillPath, SKILL_FILE);

        if (!existsSync(skillFile)) {
          logger.core.debug('Skipping directory without SKILL.md', { dir: entry.name });
          continue;
        }

        try {
          const skill = await this.loadSkill(entry.name, skillPath);
          if (skill) {
            this.skills.set(skill.id, skill);
          }
        } catch (error) {
          logger.core.warn('Failed to load skill', {
            skillId: entry.name,
            error: error instanceof Error ? error.message : error
          });
        }
      }

      logger.core.info('Discovered skills', { count: this.skills.size });
      return Array.from(this.skills.values());
    } catch (error) {
      logger.core.error('Failed to discover skills', {
        error: error instanceof Error ? error.message : error
      });
      return [];
    }
  }

  /**
   * Load a single skill from disk
   */
  private async loadSkill(id: string, skillPath: string): Promise<Skill | null> {
    const skillFile = join(skillPath, SKILL_FILE);

    try {
      const rawContent = await readFile(skillFile, 'utf-8');
      const fileStat = await stat(skillFile);

      // Parse YAML frontmatter
      const { data, content } = matter(rawContent);
      const metadata = data as SkillMetadata;

      // Validate required fields
      if (!metadata.name || !metadata.description) {
        logger.core.warn('Skill missing required metadata', { 
          skillId: id,
          hasName: !!metadata.name,
          hasDescription: !!metadata.description
        });
        // Use defaults if missing
        metadata.name = metadata.name || id;
        metadata.description = metadata.description || 'No description provided';
      }

      const skill: Skill = {
        id,
        path: skillPath,
        metadata,
        content: content.trim(),
        rawContent,
        enabled: this.config.enabledSkills.includes(id),
        lastModified: fileStat.mtimeMs,
      };

      logger.core.debug('Loaded skill', { 
        id: skill.id, 
        name: skill.metadata.name,
        enabled: skill.enabled 
      });

      return skill;
    } catch (error) {
      logger.core.error('Failed to load skill file', {
        skillId: id,
        error: error instanceof Error ? error.message : error
      });
      return null;
    }
  }

  /**
   * Get all skills
   */
  getSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get a skill by ID
   */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * Get enabled skills
   */
  getEnabledSkills(): Skill[] {
    return Array.from(this.skills.values()).filter(s => s.enabled);
  }

  /**
   * Enable a skill
   */
  async enableSkill(id: string): Promise<boolean> {
    const skill = this.skills.get(id);
    if (!skill) return false;

    skill.enabled = true;
    if (!this.config.enabledSkills.includes(id)) {
      this.config.enabledSkills.push(id);
      await this.saveConfig();
    }

    logger.core.info('Enabled skill', { id });
    return true;
  }

  /**
   * Disable a skill
   */
  async disableSkill(id: string): Promise<boolean> {
    const skill = this.skills.get(id);
    if (!skill) return false;

    skill.enabled = false;
    this.config.enabledSkills = this.config.enabledSkills.filter(s => s !== id);
    await this.saveConfig();

    logger.core.info('Disabled skill', { id });
    return true;
  }

  /**
   * Toggle a skill's enabled state
   */
  async toggleSkill(id: string): Promise<boolean> {
    const skill = this.skills.get(id);
    if (!skill) return false;

    if (skill.enabled) {
      return this.disableSkill(id);
    } else {
      return this.enableSkill(id);
    }
  }

  /**
   * Get skills context for system prompt injection
   */
  getSkillsForPrompt(): string {
    const enabledSkills = this.getEnabledSkills();
    
    if (enabledSkills.length === 0) {
      return '';
    }

    const skillsContext = enabledSkills.map(skill => {
      return `## Skill: ${skill.metadata.name}\n${skill.metadata.description}\n\n${skill.content}`;
    }).join('\n\n---\n\n');

    return `\n\n# Active Skills\n\nThe following skills are enabled and provide additional context and capabilities:\n\n${skillsContext}`;
  }

  /**
   * Validate a skill
   */
  validateSkill(skill: Skill): SkillValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!skill.metadata.name) {
      errors.push('Missing required field: name');
    } else if (!/^[a-z0-9-]+$/.test(skill.id)) {
      warnings.push('Skill ID should only contain lowercase letters, numbers, and hyphens');
    }

    if (!skill.metadata.description) {
      errors.push('Missing required field: description');
    } else if (skill.metadata.description.length > 1024) {
      warnings.push('Description exceeds recommended 1024 characters');
    }

    // Content checks
    const lineCount = skill.content.split('\n').length;
    if (lineCount > 500) {
      warnings.push(`Content has ${lineCount} lines, consider moving details to references/`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Refresh skills (re-discover from disk)
   */
  async refresh(): Promise<Skill[]> {
    await this.loadConfig();
    return this.discoverSkills();
  }
}

export const skillsService = new SkillsServiceImpl();
