import { getLogger } from '../logging';
import type { InstalledSkill } from '../../../types/skills';
import { buildSkillsContext } from './skillsContextBuilder';

const logger = getLogger();

/**
 * Build the system prompt for AI conversations
 * Includes personalization, web search, MCP tools, and diagram capabilities
 */
export async function buildSystemPrompt(
  webSearch: boolean,
  enableMCP: boolean,
  toolCount: number,
  mermaidValidation: boolean = true,
  mcpDiscoveryEnabled: boolean = true,
  projectDescription?: string,
  skills?: InstalledSkill[],
  codeModePrompt?: string | null,
  todoToolsEnabled: boolean = false
): Promise<string> {
  // Add current date information
  const currentDate = new Date();
  const dateString = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeString = currentDate.toLocaleTimeString('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit'
  });

  // Load personalization from user profile
  const { userProfileService } = await import('../userProfileService');
  const userProfile = await userProfileService.getProfile();
  const personalization = userProfile.personalization;

  // Base system prompt with personalization
  let basePersonality = 'You are a helpful assistant';

  if (personalization?.enabled) {
    // Apply personality style
    switch (personalization.personality) {
      case 'cynic':
        basePersonality = 'You are a critical and sarcastic assistant who questions assumptions and provides realistic, sometimes cynical perspectives';
        break;
      case 'robot':
        basePersonality = 'You are an efficient and blunt assistant who prioritizes directness and clarity over politeness';
        break;
      case 'listener':
        basePersonality = 'You are a thoughtful and supportive assistant who carefully considers user needs and provides empathetic responses';
        break;
      case 'nerd':
        basePersonality = 'You are an exploratory and enthusiastic assistant who loves diving deep into topics with curiosity and excitement';
        break;
      default:
        basePersonality = 'You are a cheerful and adaptive assistant who adjusts to user needs with a positive attitude';
    }

    // Add user context if available
    if (personalization.nickname) {
      basePersonality += `. The user's name is ${personalization.nickname}`;
    }
    if (personalization.occupation) {
      basePersonality += ` and they work as a ${personalization.occupation}`;
    }
    if (personalization.aboutUser) {
      basePersonality += `. Additional context about the user: ${personalization.aboutUser}`;
    }
  }

  let systemPrompt = `${basePersonality}. Today's date is ${dateString} and the current time is ${timeString}.`;

  // Add custom instructions if provided
  if (personalization?.enabled && personalization.customInstructions) {
    systemPrompt += `\n\nCUSTOM INSTRUCTIONS:\n${personalization.customInstructions}`;
  }

  // Add project context if provided
  if (projectDescription) {
    systemPrompt += `\n\nPROJECT CONTEXT:\n${projectDescription}`;
  }

  if (webSearch) {
    systemPrompt +=
      " with access to web search. Provide accurate and up-to-date information.";
  }

  if (enableMCP && toolCount > 0) {
    systemPrompt += ` You have access to ${toolCount} specialized tools through the Model Context Protocol (MCP). These tools can help you perform various tasks like file operations, database queries, web automation, and more.

IMPORTANT: When you use tools, ALWAYS provide a complete response based on the tool results. After calling a tool and receiving its output, analyze the results and provide a comprehensive answer to the user. Do not just say you're going to use a tool - actually use it AND then explain the results in detail.

For example:
- If listing directories, show the actual directory contents
- If searching files, display the search results
- If querying data, present the retrieved information

Always explain what tools you're using and provide meaningful responses based on the tool outputs.

Some MCP tools may return rich visual content (cards, charts, widgets). When multiple similar tools exist and one provides visual output, consider using the visual version for a better user experience.`;
  }

  if (!webSearch && (!enableMCP || toolCount === 0)) {
    systemPrompt += " that can answer questions and help with tasks.";
  }

  // Add Mermaid diagram capabilities (if enabled)
  if (mermaidValidation) {
    systemPrompt += `

DIAGRAM CAPABILITIES:
You can create visual diagrams using Mermaid syntax. When users request diagrams, charts, or visual representations, use Mermaid code blocks. Supported diagram types include:

- **Flowcharts**: For processes, workflows, decision trees
- **Sequence diagrams**: For interactions between systems/users over time
- **Class diagrams**: For object-oriented designs and relationships
- **State diagrams**: For state machines and transitions
- **ER diagrams**: For database relationships
- **Gantt charts**: For project timelines
- **Pie charts**: For data visualization
- **Git graphs**: For version control workflows

**Usage**: Wrap Mermaid code in \`\`\`mermaid code blocks. Examples:

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
\`\`\`

\`\`\`mermaid
sequenceDiagram
    Alice->>Bob: Hello Bob!
    Bob-->>Alice: Hello Alice!
\`\`\`

**IMPORTANT - Mermaid Best Practices**:
To ensure diagrams render correctly, follow these guidelines:

1. **Keep node labels simple and concise** - Use short text (1-3 words per line)
2. **Limit line breaks** - Use maximum 2-3 <br/> tags per node, prefer shorter labels
3. **Avoid excessive emojis** - Use sparingly (0-1 per node) as they can cause parsing errors
4. **Use simple characters** - Avoid special characters, tildes, and complex unicode when possible
5. **Test complexity** - If a diagram seems too complex, split it into multiple simpler diagrams
6. **Prefer clarity over detail** - Simple, clear diagrams are better than complex, detailed ones
7. **Color contrast** - When using colors, ensure good readability:
   - Avoid bright colors (yellow, light green, cyan) with light text - poor contrast
   - Use dark colors (#2c5282, #1e3a5f, #2d5016) for white text
   - Use light colors (#e0f2fe, #f0fdf4) for dark text
   - BEST: Use default theme colors (no custom styling) for automatic contrast
   - Example: 'style A fill:#2c5282,color:#fff' (good) vs 'style A fill:#ffff00' (bad - unreadable)

**Example of GOOD syntax**:
\`\`\`mermaid
graph LR
    A[React Hook Form<br/>Winner 2025] --> B[Recommended]
    C[Formik<br/>Legacy] --> D[Alternative]
    style A fill:#2c5282,color:#fff
    style C fill:#f0fdf4,color:#0f172a
\`\`\`

**Example of BAD syntax (avoid these)**:
\`\`\`mermaid
graph TD
    A[Library ⭐⭐⭐<br/>- Feature 1<br/>- Feature 2<br/>- Feature 3<br/>- Feature 4] --> B
    style A fill:#ffff00
    style B fill:#00ff00,color:#fff
\`\`\`
(Too many emojis, too many line breaks, bright yellow/green with poor contrast)

Always provide diagrams when users request visual representations, but prioritize simple, parseable syntax over visual complexity.

VALIDATION PROTOCOL:
If you are requested to generate a Mermaid diagram or decide to generate one:
1. You MUST use the \`builtin_validate_mermaid\` tool to validate the code BEFORE presenting it.
2. If validation fails, use the error information to fix the code and validate again.
3. Only output the Mermaid code block if it passes validation.
4. Output the diagram in a markdown code block with the \`mermaid\` language identifier.`;
  }

  // Add MCP Discovery capabilities (if enabled)
  if (mcpDiscoveryEnabled) {
    systemPrompt += `

MCP DISCOVERY:
You have access to the \`mcp_discovery\` tool to search for MCP servers in the Levante MCP Shop.

Use this tool when:
- Users ask about adding capabilities, integrations, or tools you don't currently have
- Users want to connect to external services (GitHub, databases, file systems, email, etc.)
- Users ask "Can you access X?" or "Is there a tool for Y?"
- You cannot fulfill a user's request with your current tools

When presenting discovery results to users:
1. Show each server with its name and a brief description
2. Include the configure URL as a markdown link - it will render as a clickable button
3. Use this exact format: [Configure ServerName](configureUrl)
4. Mention if the server requires API keys or authentication
5. Offer to help once the user has configured the server

Example response format:
"To access GitHub, I found this MCP server you can configure:

**GitHub** - Access GitHub repositories, issues, and pull requests

[Configure GitHub](levante://mcp/configure/github)

*Requires: GitHub Personal Access Token*

Click the button above to add it. Once configured, I'll be able to help you with GitHub operations."`;
  }

  // Inject Code Mode agent prompt when Code Mode is active
  if (codeModePrompt) {
    systemPrompt += `\n\n${codeModePrompt}`;
    logger.aiSdk.info('Code Mode: agent prompt injected into system prompt', {
      promptLength: codeModePrompt.length,
    });
  }

  if (todoToolsEnabled) {
    systemPrompt += `

TASK TRACKING:
When tracking multi-step work, call \`todo_write\` with the full task list every time you need to add tasks, start one (\`in_progress\`), finish one (\`completed\`), or rename/reorder. Reuse the same \`id\` for a task across turns. Pass an empty array when all work is done.
- Use it for multi-step work in Cowork mode.
- Keep task subjects short and imperative.
- Do not create todos for trivial one-step actions.
`;
  }

  const skillsSection = buildSkillsContext(skills ?? []);
  if (skillsSection) {
    systemPrompt += skillsSection;
  }

  // Debug log for final system prompt
  logger.aiSdk.debug('Final system prompt generated', {
    enabled: personalization?.enabled || false,
    personality: personalization?.personality || 'none',
    hasNickname: !!personalization?.nickname,
    hasOccupation: !!personalization?.occupation,
    hasAboutUser: !!personalization?.aboutUser,
    hasCustomInstructions: !!personalization?.customInstructions,
    webSearch,
    enableMCP,
    toolCount,
    mermaidValidation,
    mcpDiscoveryEnabled,
    promptLength: systemPrompt.length,
    fullPrompt: systemPrompt
  });

  return systemPrompt;
}
