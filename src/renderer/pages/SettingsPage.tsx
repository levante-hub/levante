import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, Settings } from 'lucide-react';
import { getRendererLogger } from '@/services/logger';

const logger = getRendererLogger();

const SettingsPage = () => {
  const [maxStepsConfig, setMaxStepsConfig] = useState({
    baseSteps: 5,
    maxSteps: 20,
    saving: false,
    saved: false
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

  useEffect(() => {
    loadStepsConfig();
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="space-y-2">
          <p className="text-muted-foreground">Configure your application preferences here.</p>
        </div>
        
        <div className="bg-card p-6 rounded-lg border">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            AI Configuration
          </h3>
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
        </div>

      </div>
    </div>
  )
}

export default SettingsPage