import { SettingRepository } from '../../../domain/ports/secondary/SettingRepository';
import { Setting } from '../../../domain/entities/Setting';

export class ElectronSettingRepository implements SettingRepository {
  
  async save(setting: Setting): Promise<Setting> {
    const result = await window.levante.preferences.set(setting.getKey(), setting.getValue());
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to save setting');
    }
    
    return setting;
  }

  async findById(id: string): Promise<Setting | null> {
    const result = await window.levante.preferences.get(id);
    
    if (!result.success) {
      return null;
    }
    
    if (result.data === undefined) {
      return null;
    }
    
    return Setting.create({
      key: id,
      value: result.data,
      type: typeof result.data,
      category: 'user',
      description: `User setting: ${id}`
    });
  }

  async findAll(): Promise<Setting[]> {
    const result = await window.levante.preferences.getAll();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to find all settings');
    }
    
    const preferences = result.data || {};
    const settings: Setting[] = [];
    
    for (const [key, value] of Object.entries(preferences)) {
      settings.push(Setting.create({
        key,
        value,
        type: typeof value,
        category: 'user',
        description: `User setting: ${key}`
      }));
    }
    
    return settings;
  }

  async delete(id: string): Promise<boolean> {
    const result = await window.levante.preferences.delete(id);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete setting');
    }
    
    return result.data || false;
  }

  async findByCategory(category: string): Promise<Setting[]> {
    // Since we're using electron preferences, we don't have categories
    // We'll return all settings for any category request
    return await this.findAll();
  }

  async findByPrefix(prefix: string): Promise<Setting[]> {
    const allSettings = await this.findAll();
    return allSettings.filter(setting => setting.getKey().startsWith(prefix));
  }

  async exists(key: string): Promise<boolean> {
    const result = await window.levante.preferences.has(key);
    
    if (!result.success) {
      return false;
    }
    
    return result.data || false;
  }

  async count(): Promise<number> {
    const allSettings = await this.findAll();
    return allSettings.length;
  }

  async updateValue(key: string, value: any): Promise<boolean> {
    const result = await window.levante.preferences.set(key, value);
    return result.success;
  }

  async reset(): Promise<boolean> {
    const result = await window.levante.preferences.reset();
    return result.success;
  }

  async exportSettings(): Promise<Record<string, any>> {
    const result = await window.levante.preferences.export();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to export settings');
    }
    
    return result.data || {};
  }

  async importSettings(settings: Record<string, any>): Promise<boolean> {
    const result = await window.levante.preferences.import(settings);
    return result.success;
  }

  async getInfo(): Promise<{ path: string; size: number }> {
    const result = await window.levante.preferences.info();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get settings info');
    }
    
    return result.data || { path: '', size: 0 };
  }
}