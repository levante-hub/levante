import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPathTail(filePath: string, segmentCount = 2): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const hasLeadingSlash = normalized.startsWith('/')
  const segments = normalized.split('/').filter(Boolean)

  if (segments.length === 0) return filePath
  if (segments.length <= segmentCount) {
    return `${hasLeadingSlash ? '/' : ''}${segments.join('/')}`
  }

  return `.../${segments.slice(-segmentCount).join('/')}`
}

/**
 * Normalize a filesystem path to POSIX-style forward slashes.
 * Required before passing Windows paths (with `\`) to `path-browserify`,
 * which is POSIX-only and would otherwise misinterpret them.
 */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}
