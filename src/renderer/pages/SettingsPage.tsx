import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CheckCircle, Settings, User, ChevronDown, Palette } from 'lucide-react';
import { getRendererLogger } from '@/services/logger';
import type { PersonalizationSettings } from '../../types/userProfile';

const logger = getRendererLogger();

const PERSONALITY_OPTIONS = [
  { value: 'default', label: 'Default', description: 'Cheerful and adaptive' },
  { value: 'cynic', label: 'Cynic', description: 'Critical and sarcastic' },
  { value: 'robot', label: 'Robot', description: 'Efficient and blunt' },
  { value: 'listener', label: 'Listener', description: 'Thoughtful and supportive' },
  { value: 'nerd', label: 'Nerd', description: 'Exploratory and enthusiastic' },
];

const THEME_OPTIONS = [
  { value: 'system', label: 'System', description: 'Follow system settings' },
  { value: 'light', label: 'Light', description: 'Light theme' },
  { value: 'dark', label: 'Dark', description: 'Dark theme' },
];

const SettingsPage = () => {
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');

  const [maxStepsConfig, setMaxStepsConfig] = useState({
    baseSteps: 5,
    maxSteps: 20,
    saving: false,
    saved: false
  });

  const [personalization, setPersonalization] = useState<PersonalizationSettings>({
    enabled: false,
    personality: 'default',
    customInstructions: '',
    nickname: '',
    occupation: '',
    aboutUser: '',
  });

  const [personalizationState, setPersonalizationState] = useState({
    saving: false,
    saved: false,
  });

  const [themeState, setThemeSaveState] = useState({
    saving: false,
    saved: false,
  });

  const loadStepsConfig = async () => {
    try {
      const aiConfig = await window.levante.preferences.get('ai');

      setMaxStepsConfig(prev => ({
        ...prev,
        baseSteps: aiConfig?.data?.baseSteps || 5,
        maxSteps: aiConfig?.data?.maxSteps || 20
      }));
    } catch (error) {
      logger.preferences.error('Error loading AI steps configuration', { error: error instanceof Error ? error.message : error });
    }
  };

  const loadPersonalization = async () => {
    try {
      const profile = await window.levante.profile.get();

      if (profile?.data?.personalization) {
        setPersonalization(profile.data.personalization);
      }
      if (profile?.data?.theme) {
        setThemeState(profile.data.theme);
      }
    } catch (error) {
      logger.preferences.error('Error loading personalization settings', { error: error instanceof Error ? error.message : error });
    }
  };

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    setThemeSaveState({ saving: true, saved: false });
    setThemeState(newTheme);

    try {
      await window.levante.profile.update({
        theme: newTheme
      });

      setThemeSaveState({ saving: false, saved: true });

      // Clear saved indicator after 3 seconds
      setTimeout(() => {
        setThemeSaveState({ saving: false, saved: false });
      }, 3000);

      // Dispatch event to notify App.tsx to update theme
      window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: newTheme } }));
    } catch (error) {
      logger.preferences.error('Error saving theme', { theme: newTheme, error: error instanceof Error ? error.message : error });
      setThemeSaveState({ saving: false, saved: false });
    }
  };

  const handleSaveStepsConfig = async () => {
    setMaxStepsConfig(prev => ({ ...prev, saving: true, saved: false }));

    try {
      await window.levante.preferences.set('ai', {
        baseSteps: maxStepsConfig.baseSteps,
        maxSteps: maxStepsConfig.maxSteps
      });

      setMaxStepsConfig(prev => ({ ...prev, saving: false, saved: true }));

      // Clear saved indicator after 3 seconds
      setTimeout(() => {
        setMaxStepsConfig(prev => ({ ...prev, saved: false }));
      }, 3000);
    } catch (error) {
      logger.preferences.error('Error saving AI steps configuration', { baseSteps: maxStepsConfig.baseSteps, maxSteps: maxStepsConfig.maxSteps, error: error instanceof Error ? error.message : error });
      setMaxStepsConfig(prev => ({ ...prev, saving: false }));
    }
  };

  const handleSavePersonalization = async () => {
    setPersonalizationState({ saving: true, saved: false });

    try {
      await window.levante.profile.update({
        personalization
      });

      setPersonalizationState({ saving: false, saved: true });

      // Clear saved indicator after 3 seconds
      setTimeout(() => {
        setPersonalizationState({ saving: false, saved: false });
      }, 3000);
    } catch (error) {
      logger.preferences.error('Error saving personalization settings', { error: error instanceof Error ? error.message : error });
      setPersonalizationState({ saving: false, saved: false });
    }
  };

  useEffect(() => {
    loadStepsConfig();
    loadPersonalization();
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6 px-4 mb-10">
        {/* Personalization Settings - First Block */}
        <Collapsible defaultOpen className="bg-card rounded-lg border-none">
          <div className="p-6">
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <User className="w-5 h-5" />
                Personalization
              </h3>
              <ChevronDown className="w-5 h-5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-4">
              <div className="space-y-6">
                {/* Enable Customization Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableCustomization" className="text-base">
                      Enable customization
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Customize how AI responds to you
                    </p>
                  </div>
                  <Switch
                    id="enableCustomization"
                    checked={personalization.enabled}
                    onCheckedChange={(checked) =>
                      setPersonalization(prev => ({ ...prev, enabled: checked }))
                    }
                  />
                </div>

                {/* Personality Selector */}
                <div className="space-y-2">
                  <Label htmlFor="personality">AI Personality</Label>
                  <Select
                    value={personalization.personality}
                    onValueChange={(value) =>
                      setPersonalization(prev => ({
                        ...prev,
                        personality: value as PersonalizationSettings['personality']
                      }))
                    }
                    disabled={!personalization.enabled}
                  >
                    <SelectTrigger id="personality">
                      <SelectValue placeholder="Select personality" />
                    </SelectTrigger>
                    <SelectContent>
                      {PERSONALITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex flex-col">
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs text-muted-foreground">{option.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Set the style and tone AI uses when responding
                  </p>
                </div>

                {/* Custom Instructions */}
                <div className="space-y-2">
                  <Label htmlFor="customInstructions">Custom instructions</Label>
                  <Textarea
                    id="customInstructions"
                    placeholder="Additional behavior, style, and tone preferences"
                    value={personalization.customInstructions}
                    onChange={(e) =>
                      setPersonalization(prev => ({
                        ...prev,
                        customInstructions: e.target.value
                      }))
                    }
                    disabled={!personalization.enabled}
                    className="min-h-[80px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Provide additional context about how you want the AI to behave
                  </p>
                </div>

                {/* About You Section */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">About you</h4>

                  <div className="space-y-2">
                    <Label htmlFor="nickname">Nickname</Label>
                    <Input
                      id="nickname"
                      placeholder="What should AI call you?"
                      value={personalization.nickname}
                      onChange={(e) =>
                        setPersonalization(prev => ({
                          ...prev,
                          nickname: e.target.value
                        }))
                      }
                      disabled={!personalization.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="occupation">Occupation</Label>
                    <Input
                      id="occupation"
                      placeholder="e.g., Software Engineer"
                      value={personalization.occupation}
                      onChange={(e) =>
                        setPersonalization(prev => ({
                          ...prev,
                          occupation: e.target.value
                        }))
                      }
                      disabled={!personalization.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="aboutUser">More about you</Label>
                    <Textarea
                      id="aboutUser"
                      placeholder="Share additional context about yourself that might help AI provide better responses"
                      value={personalization.aboutUser}
                      onChange={(e) =>
                        setPersonalization(prev => ({
                          ...prev,
                          aboutUser: e.target.value
                        }))
                      }
                      disabled={!personalization.enabled}
                      className="min-h-[80px] resize-none"
                    />
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center gap-4 pt-2">
                  <Button
                    onClick={handleSavePersonalization}
                    disabled={personalizationState.saving || !personalization.enabled}
                    variant="outline"
                    size="sm"
                  >
                    {personalizationState.saving ? 'Saving...' : 'Save Personalization'}
                  </Button>

                  {personalizationState.saved && (
                    <div className="flex items-center text-green-600 text-sm">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Saved successfully
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Appearance - Second Block */}
        <Collapsible className="bg-card rounded-lg border-none">
          <div className="p-6">
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Appearance
              </h3>
              <ChevronDown className="w-5 h-5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-4">
              <div className="space-y-6">
                {/* Theme Selector */}
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select
                    value={theme || 'system'}
                    onValueChange={(value) => handleThemeChange(value as 'light' | 'dark' | 'system')}
                  >
                    <SelectTrigger id="theme">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      {THEME_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex flex-col">
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs text-muted-foreground">{option.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose how the app looks, or sync with your system settings
                  </p>

                  {/* Save indicator */}
                  {themeState.saved && (
                    <div className="flex items-center text-green-600 text-sm">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Theme saved successfully
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* AI Configuration - Third Block */}
        <Collapsible className="bg-card rounded-lg border-none">
          <div className="p-6">
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                AI Configuration
              </h3>
              <ChevronDown className="w-5 h-5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>

            <CollapsibleContent className="mt-4">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Multi-Step Tool Execution Limits</h4>
                  <p className="text-muted-foreground text-sm">
                    Configure how many steps the AI can take when using tools. The actual step count is calculated dynamically based on the number of available tools.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="baseSteps">Base Steps</Label>
                      <Input
                        id="baseSteps"
                        type="number"
                        min="1"
                        max="10"
                        value={maxStepsConfig.baseSteps}
                        onChange={(e) => setMaxStepsConfig(prev => ({
                          ...prev,
                          baseSteps: parseInt(e.target.value) || 5
                        }))}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Minimum steps allowed (default: 5)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="maxSteps">Maximum Steps</Label>
                      <Input
                        id="maxSteps"
                        type="number"
                        min="5"
                        max="50"
                        value={maxStepsConfig.maxSteps}
                        onChange={(e) => setMaxStepsConfig(prev => ({
                          ...prev,
                          maxSteps: parseInt(e.target.value) || 20
                        }))}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Maximum steps allowed (default: 20)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <Button
                      onClick={handleSaveStepsConfig}
                      disabled={maxStepsConfig.saving}
                      variant="outline"
                      size="sm"
                    >
                      {maxStepsConfig.saving ? 'Saving...' : 'Save Configuration'}
                    </Button>

                    {maxStepsConfig.saved && (
                      <div className="flex items-center text-green-600 text-sm">
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Saved successfully
                      </div>
                    )}
                  </div>

                  <div className="bg-muted/50 p-3 rounded-md text-sm">
                    <p className="font-medium mb-1">How it works:</p>
                    <ul className="text-muted-foreground space-y-1 text-xs">
                      <li>• Formula: Base Steps + (Number of Tools ÷ 5) × 2</li>
                      <li>• With 24 tools: {maxStepsConfig.baseSteps} + (24 ÷ 5) × 2 = {Math.min(Math.max(maxStepsConfig.baseSteps + Math.floor(24 / 5) * 2, maxStepsConfig.baseSteps), maxStepsConfig.maxSteps)} steps</li>
                      <li>• Prevents infinite loops while allowing complex operations</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

      </div>
    </div>
  )
}

export default SettingsPage