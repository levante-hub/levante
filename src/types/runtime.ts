export type RuntimeType = 'node' | 'python' | 'gitbash';
export type RuntimeSource = 'system' | 'shared';
export type RuntimeErrorType = 'RUNTIME_NOT_FOUND' | 'RUNTIME_CHOICE_REQUIRED';

export interface RuntimeConfig {
  type: RuntimeType;
  version: string;
  source?: RuntimeSource;
}

export interface RuntimeInfo {
  type: RuntimeType;
  version: string;
  path: string;
  source: RuntimeSource;
  usedBy: string[]; // Server IDs
  size?: string;
}

export interface RuntimeManifest {
  runtimes: RuntimeInfo[];
}
