#!/usr/bin/env node

/**
 * Migration script to convert console.* calls to centralized logger
 * 
 * Usage: node scripts/migrate-logging.js [file-pattern]
 * Example: node scripts/migrate-logging.js "src/main/services/*.ts"
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

// Category mappings based on file paths
const categoryMappings = {
  '/services/ai': 'aiSdk',
  '/services/mcp': 'mcp', 
  '/services/database': 'database',
  '/services/chat': 'database',
  '/services/model': 'core',
  '/services/title': 'core',
  '/services/preferences': 'preferences',
  '/ipc/': 'ipc',
  '/renderer/': 'core', // Default for renderer
  '/main/': 'core', // Default for main
};

// Log level mappings
const logLevelMappings = {
  'console.log': 'debug',
  'console.info': 'info',
  'console.warn': 'warn', 
  'console.error': 'error',
  'console.debug': 'debug'
};

/**
 * Determine the appropriate log category based on file path
 */
function getCategoryFromPath(filePath) {
  for (const [pathSegment, category] of Object.entries(categoryMappings)) {
    if (filePath.includes(pathSegment)) {
      return category;
    }
  }
  return 'core'; // Default category
}

/**
 * Check if file already imports the logger
 */
function hasLoggerImport(content) {
  return content.includes('getLogger') || content.includes('import { logger }');
}

/**
 * Add logger import to file
 */
function addLoggerImport(content, filePath) {
  const isRenderer = filePath.includes('/renderer/');
  const isMain = filePath.includes('/main/');
  
  let importStatement;
  let classModification = '';
  
  if (isRenderer) {
    importStatement = "import { logger } from '@/services/logger';";
  } else if (isMain) {
    importStatement = "import { getLogger } from './services/logging';";
    classModification = '\n  private logger = getLogger();';
  } else {
    return content; // Skip unknown file types
  }
  
  // Find the last import statement
  const lines = content.split('\n');
  let lastImportIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ') || lines[i].trim().startsWith('} from ')) {
      lastImportIndex = i;
    }
  }
  
  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, importStatement);
    
    // Add logger instance to classes if in main process
    if (isMain && classModification) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().match(/^export class \w+/)) {
          // Find the opening brace
          for (let j = i; j < lines.length; j++) {
            if (lines[j].includes('{')) {
              lines.splice(j + 1, 0, classModification);
              break;
            }
          }
          break;
        }
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Convert console.* calls to logger calls
 */
function convertConsoleCalls(content, category) {
  let result = content;
  
  // Patterns to match console calls
  const patterns = [
    // console.log('message', data) -> logger.category.debug('message', data)
    /console\.(log|info|warn|error|debug)\s*\(\s*(['"`][^'"`]*['"`])\s*,\s*([^)]+)\)/g,
    // console.log('message') -> logger.category.debug('message')  
    /console\.(log|info|warn|error|debug)\s*\(\s*(['"`][^'"`]*['"`])\s*\)/g,
    // console.log(variable, data) -> logger.category.debug('Log message', { variable, data })
    /console\.(log|info|warn|error|debug)\s*\(\s*([^'"`][^,)]+)\s*,\s*([^)]+)\)/g,
    // console.log(variable) -> logger.category.debug('Log message', { variable })
    /console\.(log|info|warn|error|debug)\s*\(\s*([^'"`][^)]+)\s*\)/g,
  ];
  
  patterns.forEach(pattern => {
    result = result.replace(pattern, (match, level, ...args) => {
      const loggerLevel = logLevelMappings[`console.${level}`] || 'debug';
      const loggerCategory = category;
      
      // Handle different argument patterns
      if (args.length === 2 && args[0].match(/^['"`]/)) {
        // String message with context: console.log('message', data)
        const message = args[0];
        const context = args[1];
        return `logger.${loggerCategory}.${loggerLevel}(${message}, ${context})`;
      } else if (args.length === 1 && args[0].match(/^['"`]/)) {
        // Simple string message: console.log('message')
        const message = args[0];
        return `logger.${loggerCategory}.${loggerLevel}(${message})`;
      } else if (args.length === 2) {
        // Variable with context: console.log(variable, data)  
        const variable = args[0].trim();
        const context = args[1].trim();
        return `logger.${loggerCategory}.${loggerLevel}('${variable}', { ${variable}: ${variable}, context: ${context} })`;
      } else if (args.length === 1) {
        // Single variable: console.log(variable)
        const variable = args[0].trim();
        return `logger.${loggerCategory}.${loggerLevel}('${variable}', { ${variable} })`;
      }
      
      return match; // Fallback to original if no pattern matches
    });
  });
  
  return result;
}

/**
 * Process a single file
 */
async function processFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    // Skip files that don't have console calls
    if (!content.match(/console\.(log|info|warn|error|debug)/)) {
      return { processed: false, reason: 'No console calls found' };
    }
    
    // Skip files that already use the logger
    if (hasLoggerImport(content)) {
      return { processed: false, reason: 'Already uses logger' };
    }
    
    const category = getCategoryFromPath(filePath);
    let result = content;
    
    // Add logger import
    result = addLoggerImport(result, filePath);
    
    // Convert console calls
    result = convertConsoleCalls(result, category);
    
    // Only write if content actually changed
    if (result !== content) {
      await fs.writeFile(filePath, result, 'utf8');
      return { processed: true, category };
    }
    
    return { processed: false, reason: 'No changes needed' };
    
  } catch (error) {
    return { processed: false, error: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  const pattern = process.argv[2] || 'src/**/*.{ts,tsx}';
  
  console.log(`🔍 Scanning files matching: ${pattern}`);
  
  const files = await glob(pattern, { 
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/build/**',
      '**/*.d.ts'
    ]
  });
  
  console.log(`📁 Found ${files.length} files to process\n`);
  
  const results = {
    processed: 0,
    skipped: 0,
    errors: 0
  };
  
  for (const file of files) {
    const result = await processFile(file);
    
    if (result.processed) {
      console.log(`✅ ${file} (${result.category})`);
      results.processed++;
    } else if (result.error) {
      console.log(`❌ ${file}: ${result.error}`);
      results.errors++;
    } else {
      console.log(`⏭️  ${file}: ${result.reason}`);
      results.skipped++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   Processed: ${results.processed}`);
  console.log(`   Skipped: ${results.skipped}`);
  console.log(`   Errors: ${results.errors}`);
  
  if (results.processed > 0) {
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Review the changes: git diff`);
    console.log(`   2. Test the application: pnpm dev`);
    console.log(`   3. Adjust .env.local logging configuration as needed`);
    console.log(`   4. Commit the changes if everything looks good`);
  }
}

// Run the script
main().catch(console.error);