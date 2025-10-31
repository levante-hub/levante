/**
 * MCP Package Security Validator
 *
 * Validates npx packages and arguments to prevent command injection attacks.
 * Used by both deep link parsing and command resolution.
 */

import { getLogger } from "../logging";

const logger = getLogger();

/**
 * Official MCP packages whitelist
 * These packages are verified and safe to execute
 */
export const OFFICIAL_MCP_PACKAGES = [
  '@modelcontextprotocol/server-memory',
  '@modelcontextprotocol/server-filesystem',
  '@modelcontextprotocol/server-sqlite',
  '@modelcontextprotocol/server-postgres',
  '@modelcontextprotocol/server-brave-search',
  '@modelcontextprotocol/server-fetch',
  '@modelcontextprotocol/server-github',
  '@modelcontextprotocol/server-google-maps',
  '@modelcontextprotocol/server-puppeteer',
  '@modelcontextprotocol/server-slack',
  '@modelcontextprotocol/server-everything'
] as const;

/**
 * Dangerous npx flags that allow arbitrary code execution or modify behavior unsafely
 */
export const BLOCKED_NPX_FLAGS = [
  '-e',
  '--eval',
  '--call',
  '-c',
  '--shell-auto-fallback'
] as const;

/**
 * Official Python MCP packages whitelist (installed via uvx)
 * These packages are verified and safe to execute
 */
export const OFFICIAL_PYTHON_MCP_PACKAGES = [
  'mcp-server-git',
  'mcp-server-time',
  'mcp-server-fetch',
  'mcp-server-filesystem',
  'mcp-server-memory',
  'mcp-server-sequential-thinking'
] as const;

/**
 * System commands that are blocked for security
 * These commands can be used for malicious purposes
 */
export const BLOCKED_COMMANDS = [
  // Shell commands
  'bash', 'sh', 'zsh', 'fish', 'csh', 'tcsh', 'ksh',
  // Network utilities
  'curl', 'wget', 'nc', 'netcat', 'telnet', 'ftp', 'sftp',
  // File system operations
  'rm', 'dd', 'mkfs', 'fdisk', 'mount', 'umount',
  // Process and system control
  'kill', 'killall', 'pkill', 'shutdown', 'reboot', 'halt',
  // Execution wrappers
  'eval', 'exec', 'sudo', 'su', 'doas',
  // Compilers/interpreters (without proper args validation)
  'gcc', 'g++', 'cc', 'ld', 'as'
] as const;

/**
 * Dangerous Python patterns that allow arbitrary code execution
 * Note: '-m' flag itself is allowed for legitimate module execution (e.g., python -m my_mcp_server)
 * but we block dangerous combinations like 'pip', 'pip3', etc.
 */
export const BLOCKED_PYTHON_PATTERNS = [
  '-c',           // Execute code: python -c "import os; os.system('rm -rf /')"
  '--command',    // Alternative to -c
  'eval(',        // Prevent eval in arguments
  'exec(',        // Prevent exec in arguments
  '__import__('   // Prevent dynamic imports
] as const;

/**
 * Blocked Python modules for -m flag (package managers, dangerous modules)
 */
export const BLOCKED_PYTHON_MODULES = [
  'pip',          // python -m pip install malicious
  'pip3',         // python -m pip3 install malicious
  'easy_install', // python -m easy_install malicious
  'ensurepip',    // python -m ensurepip (installs pip)
  'venv',         // python -m venv could be used for persistence
  'site',         // python -m site can modify Python paths
] as const;

/**
 * Dangerous uv subcommands that could modify system state
 */
export const BLOCKED_UV_SUBCOMMANDS = [
  'pip install',     // uv pip install (global installation)
  'pip uninstall',   // uv pip uninstall
  'tool install',    // uv tool install (persistent installation)
  'tool uninstall',  // uv tool uninstall
  'cache clear',     // uv cache clear (could be used for DoS)
  'self update',     // uv self update (modify uv itself)
] as const;

/**
 * Safe uv subcommands that are allowed
 */
export const SAFE_UV_SUBCOMMANDS = [
  'run',        // uv run (isolated project execution)
  'tool run',   // uv tool run (temporary tool execution, alias: uvx)
] as const;

/**
 * Dangerous Node.js flags that allow arbitrary code execution
 */
export const BLOCKED_NODE_FLAGS = [
  '-e',
  '--eval',
  '-p',
  '--print',
  '--inspect',      // Remote debugging can be exploited
  '--inspect-brk',
  '--require',      // Preload malicious modules
  '-r'
] as const;

/**
 * Valid npm package name regex
 * Matches: @scope/package-name or package-name
 */
export const NPM_PACKAGE_REGEX = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * Valid Python package name regex (PyPI naming conventions)
 * Matches: package-name or package_name
 */
export const PYTHON_PACKAGE_REGEX = /^[a-z0-9]([a-z0-9-_]*[a-z0-9])?$/i;

/**
 * Safe npx flags that don't pose security risks
 * These are allowed and will be skipped when looking for package name
 */
const SAFE_NPX_FLAGS = ['-y', '--yes', '-q', '--quiet', '-v', '--version'] as const;

/**
 * Safe uvx flags that should be skipped when extracting package name
 * These flags take values and are legitimate for package execution
 */
const SAFE_UVX_FLAGS = [
  '--from',        // Source specification (--from ./path or --from git+https://...)
  '--with',        // Additional dependencies (--with requests)
  '--python',      // Python version (--python 3.13)
  '-p',            // Short for --python
  '--index-url',   // Custom PyPI index
  '--extra-index-url',
  '-y', '--yes',   // Auto-confirm
  '-q', '--quiet', // Quiet mode
  '-v', '--verbose', // Verbose mode
] as const;

/**
 * Extracts the package name from npx arguments, skipping safe flags
 * @param args - The arguments array
 * @returns Object with packageName and remaining args
 */
function extractPackageFromArgs(args: string[]): { packageName: string; remainingArgs: string[] } {
  // Find the first argument that is not a safe flag
  let packageIndex = -1;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // Skip safe flags
    if (SAFE_NPX_FLAGS.includes(arg as any)) {
      continue;
    }
    // Found the package name (first non-flag argument)
    if (!arg.startsWith('-')) {
      packageIndex = i;
      break;
    }
    // If it's a flag we don't recognize as safe, it might be the package if it looks like a package
    if (NPM_PACKAGE_REGEX.test(arg)) {
      packageIndex = i;
      break;
    }
  }

  if (packageIndex === -1 || packageIndex >= args.length) {
    throw new Error('No package name found in npx arguments');
  }

  const packageName = args[packageIndex];
  const remainingArgs = args.slice(packageIndex + 1);

  return { packageName, remainingArgs };
}

/**
 * Extracts the package name from uvx arguments, skipping safe flags and their values
 * uvx flags like --python, --from, --with take values that should be skipped
 * @param args - The arguments array
 * @returns Object with packageName and remaining args
 */
function extractUvxPackageFromArgs(args: string[]): { packageName: string; remainingArgs: string[] } {
  let i = 0;

  // Skip flags and their values
  while (i < args.length) {
    const arg = args[i];

    // Check if this is a flag that takes a value
    const isFlagWithValue = SAFE_UVX_FLAGS.some(flag =>
      arg === flag || arg.startsWith(`${flag}=`)
    );

    if (isFlagWithValue) {
      // If flag=value format, skip just this arg
      if (arg.includes('=')) {
        i++;
        continue;
      }
      // Otherwise skip flag and next arg (the value)
      i += 2;
      continue;
    }

    // Check if it's a standalone flag (like -y, -v)
    if (arg === '-y' || arg === '--yes' || arg === '-q' || arg === '--quiet' || arg === '-v' || arg === '--verbose') {
      i++;
      continue;
    }

    // If not a flag, this should be the package name
    if (!arg.startsWith('-')) {
      const packageName = arg;
      const remainingArgs = args.slice(i + 1);
      return { packageName, remainingArgs };
    }

    // Unknown flag, move to next
    i++;
  }

  throw new Error('No package name found in uvx arguments');
}

/**
 * Validates npx package name and arguments for security
 * @param packageName - The npm package name to validate (can include safe flags)
 * @param args - Additional arguments
 * @throws Error if validation fails
 */
export function validateNpxPackage(packageName: string, args: string[] = []): void {
  // Extract actual package name (remove -y or other safe flags)
  const cleanPackageName = packageName.replace(/^-y\s+/, '').trim();

  // Validate package name format
  if (!NPM_PACKAGE_REGEX.test(cleanPackageName)) {
    logger.mcp.error('Invalid npm package name format', { packageName: cleanPackageName });
    throw new Error(
      `Invalid package name format: "${cleanPackageName}". ` +
      `Package names must follow npm naming conventions.`
    );
  }

  // Check if package is in official whitelist
  const isOfficial = OFFICIAL_MCP_PACKAGES.includes(cleanPackageName as any);

  if (!isOfficial) {
    // Check if it's at least from @modelcontextprotocol scope
    if (!cleanPackageName.startsWith('@modelcontextprotocol/')) {
      logger.mcp.warn('Package not in official whitelist', { packageName: cleanPackageName });
      throw new Error(
        `Package "${cleanPackageName}" is not in the official MCP packages whitelist. ` +
        `For security reasons, only verified MCP packages can be installed via deep links. ` +
        `Please install this package manually through the UI if you trust it.`
      );
    }
  }

  // Check for dangerous npx flags in arguments
  const allArgs = [packageName, ...args];
  for (const arg of allArgs) {
    for (const blockedFlag of BLOCKED_NPX_FLAGS) {
      if (arg === blockedFlag || arg.startsWith(`${blockedFlag}=`)) {
        logger.mcp.error('Blocked dangerous npx flag', { flag: blockedFlag, arg });
        throw new Error(
          `Dangerous npx flag "${blockedFlag}" is not allowed. ` +
          `This flag can execute arbitrary code and poses a security risk.`
        );
      }
    }
  }

  logger.mcp.info('NPX package validation passed', {
    packageName: cleanPackageName,
    isOfficial,
    argsCount: args.length
  });
}

/**
 * Validates uvx package name and arguments for security
 * @param packageName - The Python package name to validate
 * @param args - Additional arguments
 * @throws Error if validation fails
 */
export function validateUvxPackage(packageName: string, args: string[] = []): void {
  // Validate package name format
  if (!PYTHON_PACKAGE_REGEX.test(packageName)) {
    logger.mcp.error('Invalid Python package name format', { packageName });
    throw new Error(
      `Invalid Python package name format: "${packageName}". ` +
      `Package names must follow PyPI naming conventions.`
    );
  }

  // Check if package is in official whitelist
  const isOfficial = OFFICIAL_PYTHON_MCP_PACKAGES.includes(packageName as any);

  if (!isOfficial) {
    logger.mcp.warn('Python package not in official whitelist', { packageName });
    throw new Error(
      `Package "${packageName}" is not in the official Python MCP packages whitelist. ` +
      `For security reasons, only verified MCP packages can be installed via deep links. ` +
      `Please install this package manually through the UI if you trust it.`
    );
  }

  // Check for dangerous patterns in arguments
  const allArgs = [packageName, ...args];
  for (const arg of allArgs) {
    for (const blockedPattern of BLOCKED_PYTHON_PATTERNS) {
      if (arg.includes(blockedPattern)) {
        logger.mcp.error('Blocked dangerous Python pattern', { pattern: blockedPattern, arg });
        throw new Error(
          `Dangerous Python pattern "${blockedPattern}" detected in arguments. ` +
          `This can execute arbitrary code and poses a security risk.`
        );
      }
    }
  }

  logger.mcp.info('UVX package validation passed', {
    packageName,
    isOfficial,
    argsCount: args.length
  });
}

/**
 * Validates Python direct execution arguments
 * Allows both module execution (python -m module_name) and script execution (python script.py)
 * @param args - Python command arguments
 * @throws Error if dangerous patterns detected
 */
function validatePythonExecution(args: string[] = []): void {
  // If Python is called directly, require arguments
  if (args.length === 0) {
    throw new Error('Python command requires arguments (module or script file). Direct code execution is not allowed.');
  }

  // Block dangerous patterns (arbitrary code execution)
  for (const arg of args) {
    for (const blockedPattern of BLOCKED_PYTHON_PATTERNS) {
      if (arg === blockedPattern || arg.startsWith(`${blockedPattern} `) || arg.includes(blockedPattern)) {
        logger.mcp.error('Blocked dangerous Python pattern in direct execution', { pattern: blockedPattern, arg });
        throw new Error(
          `Dangerous Python pattern "${blockedPattern}" is not allowed. ` +
          `Direct Python code execution poses a security risk.`
        );
      }
    }
  }

  const firstArg = args[0];

  // Case 1: Module execution (python -m module_name)
  if (firstArg === '-m' || firstArg === '--module') {
    if (args.length < 2) {
      throw new Error('Python -m flag requires a module name.');
    }

    const moduleName = args[1];

    // Block dangerous modules (package managers, etc.)
    for (const blockedModule of BLOCKED_PYTHON_MODULES) {
      if (moduleName === blockedModule || moduleName.startsWith(`${blockedModule} `)) {
        logger.mcp.error('Blocked dangerous Python module', { module: blockedModule, moduleName });
        throw new Error(
          `Python module "${blockedModule}" is blocked for security reasons. ` +
          `This module can install packages or modify the Python environment.`
        );
      }
    }

    logger.mcp.info('Python module execution validation passed', { moduleName });
    return;
  }

  // Case 2: Script execution (python script.py)
  if (!firstArg.endsWith('.py') && !firstArg.endsWith('.pyz')) {
    logger.mcp.warn('Python executed without .py file or -m flag', { firstArg });
    throw new Error(
      `Python command must specify either a .py script file or use -m for module execution. ` +
      `Direct code execution is not allowed for security reasons.`
    );
  }

  logger.mcp.info('Python script execution validation passed', { scriptPath: firstArg });
}

/**
 * Validates uv/uvx command execution
 * Allows safe subcommands like 'run' and 'tool run' (uvx)
 * Blocks dangerous operations like package installation
 * @param command - The base command (uv or uvx)
 * @param args - Command arguments
 * @throws Error if dangerous patterns detected
 */
function validateUvExecution(command: string, args: string[] = []): void {
  // uvx is an alias for 'uv tool run', treat it specially
  if (command === 'uvx') {
    // uvx is safe by design - it runs tools in temporary isolated environments
    // Only block dangerous Python patterns in the arguments
    for (const arg of args) {
      for (const blockedPattern of BLOCKED_PYTHON_PATTERNS) {
        if (arg.includes(blockedPattern)) {
          logger.mcp.error('Blocked dangerous Python pattern in uvx', { pattern: blockedPattern, arg });
          throw new Error(
            `Dangerous Python pattern "${blockedPattern}" detected in uvx arguments. ` +
            `This can execute arbitrary code and poses a security risk.`
          );
        }
      }
    }

    logger.mcp.info('uvx execution validation passed', { argsCount: args.length });
    return;
  }

  // For 'uv' command, validate subcommand
  if (args.length === 0) {
    throw new Error('uv command requires a subcommand (e.g., run, tool).');
  }

  const subcommand = args[0];
  const subcommandArgs = args.slice(1);

  // Check for blocked subcommands (with their arguments)
  const fullSubcommand = args.slice(0, 2).join(' '); // e.g., "pip install"

  for (const blockedCmd of BLOCKED_UV_SUBCOMMANDS) {
    if (fullSubcommand.startsWith(blockedCmd)) {
      logger.mcp.error('Blocked dangerous uv subcommand', { subcommand: blockedCmd });
      throw new Error(
        `uv subcommand "${blockedCmd}" is blocked for security reasons. ` +
        `This operation can modify the system or install packages persistently.`
      );
    }
  }

  // Allow safe subcommands explicitly
  const isSafe = SAFE_UV_SUBCOMMANDS.some(safe => fullSubcommand.startsWith(safe) || subcommand === safe);

  if (!isSafe) {
    logger.mcp.warn('Unknown uv subcommand', { subcommand, fullSubcommand });
    // Allow unknown subcommands with warning (future compatibility)
    // but block if they look dangerous
    if (subcommand.includes('install') || subcommand.includes('uninstall')) {
      throw new Error(
        `uv subcommand "${subcommand}" appears to be a package management operation and is blocked.`
      );
    }
  }

  // For 'uv run', check for dangerous Python patterns in arguments
  if (subcommand === 'run') {
    for (const arg of subcommandArgs) {
      for (const blockedPattern of BLOCKED_PYTHON_PATTERNS) {
        if (arg.includes(blockedPattern)) {
          logger.mcp.error('Blocked dangerous Python pattern in uv run', { pattern: blockedPattern, arg });
          throw new Error(
            `Dangerous Python pattern "${blockedPattern}" detected in uv run arguments. ` +
            `This can execute arbitrary code and poses a security risk.`
          );
        }
      }
    }
  }

  logger.mcp.info('uv execution validation passed', { subcommand, argsCount: subcommandArgs.length });
}

/**
 * Validates Node.js direct execution arguments
 * @param args - Node.js command arguments
 * @throws Error if dangerous flags detected
 */
function validateNodeExecution(args: string[] = []): void {
  // Block direct Node.js execution with dangerous flags
  for (const arg of args) {
    for (const blockedFlag of BLOCKED_NODE_FLAGS) {
      if (arg === blockedFlag || arg.startsWith(`${blockedFlag}=`)) {
        logger.mcp.error('Blocked dangerous Node.js flag in direct execution', { flag: blockedFlag, arg });
        throw new Error(
          `Dangerous Node.js flag "${blockedFlag}" is not allowed. ` +
          `This flag can execute arbitrary code and poses a security risk. ` +
          `Please use npx with official MCP packages instead.`
        );
      }
    }
  }

  // If Node is called directly, require a file path (not code execution)
  if (args.length === 0) {
    throw new Error('Node command requires a script file path. Direct code execution is not allowed.');
  }

  // First argument should be a file path (.js, .mjs, .cjs file)
  const firstArg = args[0];
  if (!firstArg.endsWith('.js') && !firstArg.endsWith('.mjs') && !firstArg.endsWith('.cjs')) {
    logger.mcp.warn('Node executed without .js file', { firstArg });
    throw new Error(
      `Node command must specify a .js/.mjs/.cjs script file. ` +
      `Direct code execution is not allowed for security reasons.`
    );
  }

  logger.mcp.info('Node.js execution validation passed', { scriptPath: firstArg });
}

/**
 * Validates runtime security for ANY MCP server command (NO whitelist check)
 * Used for all MCP servers, regardless of installation method
 *
 * This function validates:
 * - Dangerous system commands (bash, rm, curl, etc.)
 * - Dangerous flags for npx, python, node
 * - Code injection patterns
 *
 * This function does NOT validate:
 * - Package whitelists (only for deep links)
 *
 * @param command - The command to execute
 * @param args - Command arguments
 * @throws Error if dangerous patterns detected
 */
export function validateRuntimeSecurity(command: string, args: string[] = []): void {
  // Extract base command (remove path if present)
  const baseCommand = command.split('/').pop()?.split('\\').pop() || command;

  // 1. Block dangerous system commands
  if (BLOCKED_COMMANDS.includes(baseCommand as any)) {
    logger.mcp.error('Blocked dangerous system command (runtime)', { command: baseCommand });
    throw new Error(
      `Command "${baseCommand}" is blocked for security reasons. ` +
      `This command can be used for malicious purposes and poses a security risk.`
    );
  }

  // 2. Validate NPX dangerous flags
  if (baseCommand === 'npx') {
    // Extract package name (skip safe flags)
    const { packageName, remainingArgs } = extractPackageFromArgs(args);

    // Check for dangerous npx flags
    const allArgs = [packageName, ...remainingArgs];
    for (const arg of allArgs) {
      for (const blockedFlag of BLOCKED_NPX_FLAGS) {
        if (arg === blockedFlag || arg.startsWith(`${blockedFlag}=`)) {
          logger.mcp.error('Blocked dangerous npx flag (runtime)', { flag: blockedFlag, arg });
          throw new Error(
            `Dangerous npx flag "${blockedFlag}" is not allowed. ` +
            `This flag can execute arbitrary code and poses a security risk.`
          );
        }
      }
    }

    logger.mcp.debug('NPX runtime validation passed', { packageName });
    return;
  }

  // 3. Validate UV/UVX commands (modern Python package execution)
  if (baseCommand === 'uv' || baseCommand === 'uvx') {
    validateUvExecution(baseCommand, args);
    return;
  }

  // 4. Validate Python direct execution
  if (baseCommand === 'python' || baseCommand === 'python3' || baseCommand === 'python2') {
    validatePythonExecution(args);
    return;
  }

  // 5. Validate Node.js direct execution
  if (baseCommand === 'node' || baseCommand === 'nodejs') {
    validateNodeExecution(args);
    return;
  }

  // 6. Other commands allowed (custom executables)
  logger.mcp.debug('Custom command runtime validation passed', { command: baseCommand });
}

/**
 * Validates command and args for MCP server configuration
 * Supports multiple command types: npx, uvx, python, node, and blocks dangerous system commands
 *
 * NOTE: This function enforces WHITELIST validation and should ONLY be used for DEEP LINKS.
 * For runtime validation of manually added servers, use validateNpxFlagsOnly() or similar.
 *
 * @param command - The command to execute (e.g., "npx", "uvx", "python", "node")
 * @param args - The arguments array
 * @throws Error if validation fails
 */
export function validateMCPCommand(command: string, args: string[] = []): void {
  // Extract base command (remove path if present)
  const baseCommand = command.split('/').pop()?.split('\\').pop() || command;

  // 1. Block dangerous system commands
  if (BLOCKED_COMMANDS.includes(baseCommand as any)) {
    logger.mcp.error('Blocked dangerous system command', { command: baseCommand });
    throw new Error(
      `Command "${baseCommand}" is blocked for security reasons. ` +
      `This command can be used for malicious purposes and poses a security risk.`
    );
  }

  // 2. Validate uv/uvx (Python package manager)
  if (baseCommand === 'uv' || baseCommand === 'uvx') {
    // For uvx specifically, check whitelist for deep links
    if (baseCommand === 'uvx') {
      if (args.length === 0) {
        throw new Error('uvx command requires a package name');
      }

      // Extract package name, skipping flags like --python, --from, --with
      const { packageName, remainingArgs } = extractUvxPackageFromArgs(args);

      validateUvxPackage(packageName, remainingArgs);
      logger.mcp.info('UVX command validation passed', { packageName });
      return;
    }

    // For 'uv' command, use the general validation
    validateUvExecution(baseCommand, args);
    logger.mcp.info('UV command validation passed');
    return;
  }

  // 3. Validate direct Python execution
  if (baseCommand === 'python' || baseCommand === 'python3' || baseCommand === 'python2') {
    validatePythonExecution(args);
    logger.mcp.info('Python command validation passed');
    return;
  }

  // 4. Validate direct Node.js execution
  if (baseCommand === 'node' || baseCommand === 'nodejs') {
    validateNodeExecution(args);
    logger.mcp.info('Node.js command validation passed');
    return;
  }

  // 5. Validate npx (Node package manager)
  if (baseCommand === 'npx') {
    // For "npx <package>" format
    if (command.startsWith('npx ')) {
      const parts = command.split(' ');
      const packageName = parts.slice(1).join(' ');
      validateNpxPackage(packageName, args);
      return;
    }

    // For "npx" with args format (from deep links)
    if (args.length > 0) {
      const { packageName, remainingArgs } = extractPackageFromArgs(args);
      validateNpxPackage(packageName, remainingArgs);
      return;
    }

    throw new Error('npx command requires a package name');
  }

  // 6. Allow other commands (e.g., custom executables, /path/to/binary)
  // These might be custom MCP server implementations
  logger.mcp.debug('Custom command detected, allowing with caution', {
    command: baseCommand,
    argsCount: args.length
  });

  // Log warning for non-standard commands
  if (!baseCommand.startsWith('/') && !baseCommand.startsWith('./')) {
    logger.mcp.warn('Non-standard command detected', {
      command: baseCommand,
      note: 'Not a known package manager or full path. Ensure this is a trusted executable.'
    });
  }
}
