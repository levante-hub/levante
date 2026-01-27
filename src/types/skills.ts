/**
 * Agent Skills Type Definitions
 * 
 * Following the Agent Skills standard (agentskills.io)
 */

export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  license?: string;
  category?: string;
  tags?: string[];
  compatibility?: string;
  'allowed-tools'?: string[];
}

export interface Skill {
  id: string;                    // Directory name (unique identifier)
  path: string;                  // Full path to skill directory
  metadata: SkillMetadata;       // Parsed YAML frontmatter
  content: string;               // Markdown content (without frontmatter)
  rawContent: string;            // Full file content
  enabled: boolean;              // Whether skill is active
  lastModified: number;          // File modification timestamp
}

export interface SkillsConfig {
  enabledSkills: string[];       // Array of skill IDs that are enabled
  autoSelect: boolean;           // Auto-select skills based on task (future)
}

export interface SkillValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SkillsState {
  skills: Skill[];
  loading: boolean;
  error: string | null;
}
