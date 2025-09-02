export interface EndpointConfiguration {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  workingDirectory?: string;
  timeout?: number;
}

export class ServerEndpoint {
  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly env: Record<string, string> = {},
    private readonly workingDirectory?: string,
    private readonly timeout: number = 30000
  ) {
    if (!command.trim()) {
      throw new Error('Command cannot be empty')
    }
    if (command.length > 500) {
      throw new Error('Command cannot exceed 500 characters')
    }
    if (args.length > 50) {
      throw new Error('Cannot have more than 50 arguments')
    }
    if (Object.keys(env).length > 100) {
      throw new Error('Cannot have more than 100 environment variables')
    }
    if (timeout < 1000 || timeout > 300000) {
      throw new Error('Timeout must be between 1 second and 5 minutes')
    }

    // Validate command doesn't contain dangerous patterns
    if (this.containsDangerousPatterns(command)) {
      throw new Error('Command contains potentially dangerous patterns')
    }

    // Validate arguments don't contain dangerous patterns
    args.forEach(arg => {
      if (this.containsDangerousPatterns(arg)) {
        throw new Error('Arguments contain potentially dangerous patterns')
      }
    })
  }

  getCommand(): string {
    return this.command
  }

  getArgs(): readonly string[] {
    return [...this.args]
  }

  getEnv(): Readonly<Record<string, string>> {
    return { ...this.env }
  }

  getWorkingDirectory(): string | undefined {
    return this.workingDirectory
  }

  getTimeout(): number {
    return this.timeout
  }

  withArgs(args: string[]): ServerEndpoint {
    return new ServerEndpoint(
      this.command,
      args,
      this.env,
      this.workingDirectory,
      this.timeout
    )
  }

  withEnv(env: Record<string, string>): ServerEndpoint {
    return new ServerEndpoint(
      this.command,
      this.args,
      env,
      this.workingDirectory,
      this.timeout
    )
  }

  withWorkingDirectory(workingDirectory: string): ServerEndpoint {
    return new ServerEndpoint(
      this.command,
      this.args,
      this.env,
      workingDirectory,
      this.timeout
    )
  }

  withTimeout(timeout: number): ServerEndpoint {
    return new ServerEndpoint(
      this.command,
      this.args,
      this.env,
      this.workingDirectory,
      timeout
    )
  }

  addArg(arg: string): ServerEndpoint {
    if (this.containsDangerousPatterns(arg)) {
      throw new Error('Argument contains potentially dangerous patterns')
    }
    return new ServerEndpoint(
      this.command,
      [...this.args, arg],
      this.env,
      this.workingDirectory,
      this.timeout
    )
  }

  addEnvVar(key: string, value: string): ServerEndpoint {
    if (!key.trim() || key.length > 100) {
      throw new Error('Environment variable key must be 1-100 characters')
    }
    if (value.length > 1000) {
      throw new Error('Environment variable value cannot exceed 1000 characters')
    }

    return new ServerEndpoint(
      this.command,
      this.args,
      { ...this.env, [key]: value },
      this.workingDirectory,
      this.timeout
    )
  }

  getFullCommand(): string {
    const argsStr = this.args.length > 0 ? ` ${this.args.join(' ')}` : ''
    return `${this.command}${argsStr}`
  }

  isExecutable(): boolean {
    // Basic validation that command looks executable
    return (
      this.command.trim().length > 0 &&
      !this.command.includes('..') &&
      !this.command.startsWith('/') ||
      this.command.startsWith('/usr/') ||
      this.command.startsWith('/bin/') ||
      this.command.startsWith('/opt/')
    )
  }

  equals(other: ServerEndpoint): boolean {
    return (
      this.command === other.command &&
      this.args.length === other.args.length &&
      this.args.every((arg, index) => arg === other.args[index]) &&
      JSON.stringify(this.env) === JSON.stringify(other.env) &&
      this.workingDirectory === other.workingDirectory &&
      this.timeout === other.timeout
    )
  }

  toString(): string {
    const envVars = Object.keys(this.env).length > 0 ? 
      `${Object.entries(this.env).map(([k, v]) => `${k}=${v}`).join(' ')} ` : ''
    const workDir = this.workingDirectory ? `(in ${this.workingDirectory}) ` : ''
    return `${envVars}${workDir}${this.getFullCommand()}`
  }

  toJSON(): EndpointConfiguration {
    return {
      command: this.command,
      args: [...this.args],
      env: { ...this.env },
      ...(this.workingDirectory && { workingDirectory: this.workingDirectory }),
      timeout: this.timeout
    }
  }

  private containsDangerousPatterns(text: string): boolean {
    const dangerousPatterns = [
      /rm\s+-rf/i,
      /sudo/i,
      /chmod\s+777/i,
      /\.\.\/\.\.\//,
      /\/etc\/passwd/i,
      /\/etc\/shadow/i,
      /curl.*\|.*sh/i,
      /wget.*\|.*sh/i,
      /eval/i,
      /exec/i,
      /system/i,
      /`.*`/,
      /\$\(/,
      />\s*\/dev\//i
    ]

    return dangerousPatterns.some(pattern => pattern.test(text))
  }

  static fromJSON(config: EndpointConfiguration): ServerEndpoint {
    return new ServerEndpoint(
      config.command,
      config.args || [],
      config.env || {},
      config.workingDirectory,
      config.timeout || 30000
    )
  }

  static create(command: string): ServerEndpoint {
    return new ServerEndpoint(command)
  }

  static createPython(scriptPath: string, args: string[] = []): ServerEndpoint {
    return new ServerEndpoint('python', [scriptPath, ...args])
  }

  static createNode(scriptPath: string, args: string[] = []): ServerEndpoint {
    return new ServerEndpoint('node', [scriptPath, ...args])
  }

  static createDocker(image: string, args: string[] = []): ServerEndpoint {
    return new ServerEndpoint('docker', ['run', '--rm', image, ...args])
  }
}