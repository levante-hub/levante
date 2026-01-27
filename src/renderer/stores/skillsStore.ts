/**
 * Skills Store
 * 
 * Zustand store for managing skills state in the renderer.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Skill } from '../../types/skills';

interface SkillsStore {
  // State
  skills: Skill[];
  loading: boolean;
  error: string | null;
  skillsPath: string | null;

  // Actions
  loadSkills: () => Promise<void>;
  refreshSkills: () => Promise<void>;
  toggleSkill: (id: string) => Promise<void>;
  enableSkill: (id: string) => Promise<void>;
  disableSkill: (id: string) => Promise<void>;
  loadSkillsPath: () => Promise<void>;
  setError: (error: string | null) => void;
}

export const useSkillsStore = create<SkillsStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      skills: [],
      loading: false,
      error: null,
      skillsPath: null,

      // Load all skills
      loadSkills: async () => {
        set({ loading: true, error: null });
        
        try {
          const result = await window.levante.skills.list();
          
          if (result.success && result.data) {
            set({ skills: result.data, loading: false });
          } else {
            set({ error: result.error || 'Failed to load skills', loading: false });
          }
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to load skills',
            loading: false 
          });
        }
      },

      // Refresh skills from disk
      refreshSkills: async () => {
        set({ loading: true, error: null });
        
        try {
          const result = await window.levante.skills.refresh();
          
          if (result.success && result.data) {
            set({ skills: result.data, loading: false });
          } else {
            set({ error: result.error || 'Failed to refresh skills', loading: false });
          }
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to refresh skills',
            loading: false 
          });
        }
      },

      // Toggle a skill's enabled state
      toggleSkill: async (id: string) => {
        try {
          const result = await window.levante.skills.toggle(id);
          
          if (result.success) {
            // Update local state
            set((state) => ({
              skills: state.skills.map((skill) =>
                skill.id === id ? { ...skill, enabled: !skill.enabled } : skill
              ),
            }));
          } else {
            set({ error: result.error || 'Failed to toggle skill' });
          }
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to toggle skill'
          });
        }
      },

      // Enable a skill
      enableSkill: async (id: string) => {
        try {
          const result = await window.levante.skills.enable(id);
          
          if (result.success) {
            set((state) => ({
              skills: state.skills.map((skill) =>
                skill.id === id ? { ...skill, enabled: true } : skill
              ),
            }));
          } else {
            set({ error: result.error || 'Failed to enable skill' });
          }
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to enable skill'
          });
        }
      },

      // Disable a skill
      disableSkill: async (id: string) => {
        try {
          const result = await window.levante.skills.disable(id);
          
          if (result.success) {
            set((state) => ({
              skills: state.skills.map((skill) =>
                skill.id === id ? { ...skill, enabled: false } : skill
              ),
            }));
          } else {
            set({ error: result.error || 'Failed to disable skill' });
          }
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to disable skill'
          });
        }
      },

      // Load skills directory path
      loadSkillsPath: async () => {
        try {
          const result = await window.levante.skills.getPath();
          if (result.success && result.data) {
            set({ skillsPath: result.data });
          }
        } catch (error) {
          console.error('Failed to load skills path:', error);
        }
      },

      // Set error
      setError: (error) => set({ error }),
    }),
    { name: 'skills-store' }
  )
);
