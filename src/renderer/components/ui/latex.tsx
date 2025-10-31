import { useEffect, useState, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';
import { useThemeDetector } from '@/hooks/useThemeDetector';

interface LaTeXProps {
  children: string;
  displayMode?: boolean; // true for $$...$$ (block), false for $...$ (inline)
  className?: string;
}

export const LaTeX = ({ children, displayMode = true, className }: LaTeXProps) => {
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useThemeDetector();
  const isDark = theme === 'dark';

  useEffect(() => {
    try {
      const rendered = katex.renderToString(children, {
        displayMode,
        throwOnError: false,
        errorColor: isDark ? '#f87171' : '#dc2626', // red-400 : red-600
        strict: false,
        trust: false, // Security: don't allow \url{} and other commands
        macros: {
          // Common LaTeX macros for convenience
          '\\RR': '\\mathbb{R}',
          '\\NN': '\\mathbb{N}',
          '\\ZZ': '\\mathbb{Z}',
          '\\QQ': '\\mathbb{Q}',
          '\\CC': '\\mathbb{C}',
        },
      });
      setHtml(rendered);
      setError('');
    } catch (err) {
      console.error('KaTeX rendering error:', err);
      setError(err instanceof Error ? err.message : 'Failed to render LaTeX');
      setHtml('');
    }
  }, [children, displayMode, isDark]);

  // Apply dark mode styles to KaTeX output
  useEffect(() => {
    if (containerRef.current && html) {
      const container = containerRef.current;

      if (isDark) {
        // Dark mode: white text, adjust colors
        container.style.setProperty('color', '#f1f5f9'); // slate-100

        // Update all KaTeX elements
        const elements = container.querySelectorAll('.katex, .katex-html, .base');
        elements.forEach(el => {
          (el as HTMLElement).style.color = '#f1f5f9';
        });

        // Update fraction lines, sqrt lines, etc.
        const lines = container.querySelectorAll('.frac-line, .sqrt-line, .rule');
        lines.forEach(line => {
          (line as HTMLElement).style.borderBottomColor = '#94a3b8'; // slate-400
        });
      } else {
        // Light mode: dark text
        container.style.setProperty('color', '#0f172a'); // slate-900

        const elements = container.querySelectorAll('.katex, .katex-html, .base');
        elements.forEach(el => {
          (el as HTMLElement).style.color = '#0f172a';
        });

        const lines = container.querySelectorAll('.frac-line, .sqrt-line, .rule');
        lines.forEach(line => {
          (line as HTMLElement).style.borderBottomColor = '#64748b'; // slate-500
        });
      }
    }
  }, [html, isDark]);

  if (error) {
    return (
      <div
        className={cn(
          'text-sm p-3 rounded border font-mono',
          displayMode ? 'my-2' : 'inline-block',
          isDark
            ? 'text-red-400 bg-red-950/30 border-red-900/50'
            : 'text-red-600 bg-red-50 border-red-200',
          className
        )}
      >
        <strong>LaTeX Error:</strong> {error}
        <pre className={cn(
          'mt-2 text-xs overflow-x-auto',
          isDark ? 'text-red-300' : 'text-red-700'
        )}>
          {children}
        </pre>
      </div>
    );
  }

  if (displayMode) {
    // Block math ($$...$$)
    return (
      <div
        ref={containerRef}
        className={cn(
          'latex-display overflow-x-auto py-4 my-2',
          isDark ? 'text-slate-100' : 'text-slate-900',
          className
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Inline math ($...$)
  return (
    <span
      ref={containerRef}
      className={cn(
        'latex-inline',
        isDark ? 'text-slate-100' : 'text-slate-900',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/**
 * Utility function to detect and parse LaTeX in markdown text
 *
 * Returns an array of segments that can be either:
 * - { type: 'text', content: string }
 * - { type: 'latex-block', content: string } for $$...$$
 * - { type: 'latex-inline', content: string } for $...$
 */
export function parseLatexInText(text: string): Array<{
  type: 'text' | 'latex-block' | 'latex-inline';
  content: string;
}> {
  const segments: Array<{ type: 'text' | 'latex-block' | 'latex-inline'; content: string }> = [];
  let currentIndex = 0;

  // First, find all $$ blocks (display math)
  const blockRegex = /\$\$([\s\S]*?)\$\$/g;
  let match: RegExpExecArray | null;

  const tempText = text;
  const blockMatches: Array<{ start: number; end: number; content: string }> = [];

  while ((match = blockRegex.exec(tempText)) !== null) {
    blockMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1].trim(),
    });
  }

  // Then find all $ inline (but not within $$ blocks)
  const inlineRegex = /\$([^\$\n]+?)\$/g;
  const inlineMatches: Array<{ start: number; end: number; content: string }> = [];

  while ((match = inlineRegex.exec(tempText)) !== null) {
    // Check if this match is inside a block match
    const isInsideBlock = blockMatches.some(
      block => match!.index >= block.start && match!.index < block.end
    );

    if (!isInsideBlock) {
      inlineMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1].trim(),
      });
    }
  }

  // Combine and sort all matches
  const allMatches = [
    ...blockMatches.map(m => ({ ...m, type: 'latex-block' as const })),
    ...inlineMatches.map(m => ({ ...m, type: 'latex-inline' as const })),
  ].sort((a, b) => a.start - b.start);

  // Build segments
  allMatches.forEach(match => {
    // Add text before this match
    if (currentIndex < match.start) {
      segments.push({
        type: 'text',
        content: text.substring(currentIndex, match.start),
      });
    }

    // Add the LaTeX segment
    segments.push({
      type: match.type,
      content: match.content,
    });

    currentIndex = match.end;
  });

  // Add remaining text
  if (currentIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.substring(currentIndex),
    });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}
