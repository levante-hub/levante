import type { LogTransport, LogEntry, LogLevel } from '../../types/logger';

export class ConsoleTransport implements LogTransport {
  private readonly colors = {
    debug: '\x1b[36m',    // Cyan
    info: '\x1b[32m',     // Green
    warn: '\x1b[33m',     // Yellow
    error: '\x1b[31m',    // Red
    reset: '\x1b[0m',     // Reset
    bold: '\x1b[1m',      // Bold
    category: '\x1b[35m', // Magenta
  };

  write(entry: LogEntry): void {
    const timestamp = this.formatTimestamp(entry.timestamp);
    const category = this.formatCategory(entry.category);
    const level = this.formatLevel(entry.level);
    const message = entry.message;
    
    let output = `${timestamp} ${category} ${level} ${message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      output += '\n' + this.formatContext(entry.context);
    }

    this.writeToConsole(entry.level, output);
  }

  private formatTimestamp(timestamp: Date): string {
    return `[${timestamp.toISOString().replace('T', ' ').slice(0, -5)}]`;
  }

  private formatCategory(category: string): string {
    const categoryUpper = category.toUpperCase().replace('-', '-');
    return `${this.colors.category}[${categoryUpper}]${this.colors.reset}`;
  }

  private formatLevel(level: LogLevel): string {
    const color = this.colors[level];
    const levelUpper = level.toUpperCase();
    return `${color}${this.colors.bold}[${levelUpper}]${this.colors.reset}`;
  }

  private formatContext(context: Record<string, any>): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(context)) {
      const formattedValue = this.formatValue(value);
      lines.push(`  ${key}: ${formattedValue}`);
    }
    return lines.join('\n');
  }

  private formatValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.map(v => this.formatValue(v)).join(', ')}]`;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2).replace(/\n/g, '\n  ');
      } catch {
        return '[Object]';
      }
    }
    return String(value);
  }

  private writeToConsole(level: LogLevel, message: string): void {
    switch (level) {
      case 'debug':
        console.log(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
        console.error(message);
        break;
    }
  }
}

export class FileTransport implements LogTransport {
  constructor(private readonly filePath: string) {}

  write(entry: LogEntry): void {
    // TODO: Implement file logging to this.filePath
    // For now, fallback to console in development
    if (process.env.NODE_ENV === 'development') {
      new ConsoleTransport().write(entry);
    }
  }
}