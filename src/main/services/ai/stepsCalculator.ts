import { getLogger } from '../logging';

const logger = getLogger();

/**
 * Calculate the maximum number of steps for AI tool execution
 * Based on the number of available tools and user configuration
 */
export async function calculateMaxSteps(toolCount: number): Promise<number> {
  // Get configuration from preferences
  let baseSteps = 5;
  let maxStepsLimit = 20;

  try {
    const { preferencesService } = await import('../preferencesService');
    const aiConfig = preferencesService.get('ai');

    if (aiConfig) {
      baseSteps = aiConfig.baseSteps || 5;
      maxStepsLimit = aiConfig.maxSteps || 20;
    }
  } catch (error) {
    logger.aiSdk.warn("Could not load steps configuration, using defaults", { error });
  }

  // Additional steps based on available tools
  // For every 5 tools, add 2 more steps to allow for more complex operations
  const additionalSteps = Math.floor(toolCount / 5) * 2;

  // Apply configured limits
  const calculatedSteps = Math.min(Math.max(baseSteps + additionalSteps, baseSteps), maxStepsLimit);

  logger.aiSdk.debug("Calculated max steps", {
    calculatedSteps,
    baseSteps,
    maxStepsLimit,
    toolCount
  });

  return calculatedSteps;
}
