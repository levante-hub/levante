'use client';

import { cn } from '@/lib/utils';
import { type ComponentProps, memo, useEffect, useState } from 'react';
import { Streamdown } from 'streamdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Mermaid } from '@/components/ui/mermaid';
import { useStreamingContext } from '@/contexts/StreamingContext';

// Custom components for proper list rendering
const listComponents = {
  ul: ({ className, ...props }: any) => (
    <ul className={cn("ml-4 list-outside list-disc", className)} {...props} />
  ),
  ol: ({ className, ...props }: any) => (
    <ol className={cn("ml-4 list-outside list-decimal", className)} {...props} />
  ),
  li: ({ className, ...props }: any) => (
    <li className={cn("py-1", className)} {...props} />
  ),
};

type ResponseProps = ComponentProps<typeof Streamdown> & {
  children?: React.ReactNode;
};

const MermaidCodeBlock = ({ children, className }: { children: string; className?: string }) => {
  return (
    <div className={cn("my-6 border rounded-lg p-6 bg-muted/50 overflow-auto shadow-sm dark:bg-muted-foreground", className)}>
      <Mermaid chart={children} className="w-full h-auto min-h-[200px] flex items-center justify-center" />
    </div>
  );
};

const processContentWithMermaid = (content: string) => {
  // More flexible regex that handles different line endings and spacing
  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)\n\s*```/g;
  let match;
  const parts = [];
  let lastIndex = 0;

  while ((match = mermaidRegex.exec(content)) !== null) {
    // Add text before mermaid block
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index)
      });
    }

    // Add mermaid block
    parts.push({
      type: 'mermaid',
      content: match[1].trim()
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex)
    });
  }

  return parts.length > 1 ? parts : [{ type: 'text', content }];
};

export const Response = memo(
  ({ className, children, ...props }: ResponseProps) => {
    const [shouldProcessMermaid, setShouldProcessMermaid] = useState(false);
    const { streamFinished } = useStreamingContext();

    // Listen for streaming finish events
    useEffect(() => {
      if (typeof children === 'string' && children.includes('```mermaid')) {
        setShouldProcessMermaid(true);
      }
    }, [streamFinished, children]);

    if (typeof children !== 'string') {
      return (
        <Streamdown
          className={cn(
            'w-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
            className
          )}
          components={listComponents}
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          {...props}
        >
          {children}
        </Streamdown>
      );
    }

    // Check if content has complete mermaid blocks
    const hasCompleteMermaid = /```mermaid\s*\n[\s\S]*?\n\s*```/.test(children);

    // If we should process Mermaid and have complete blocks, do so
    if (shouldProcessMermaid && hasCompleteMermaid) {
      const parts = processContentWithMermaid(children);

      if (parts.length > 1 || (parts.length === 1 && parts[0].type === 'mermaid')) {
        return (
          <div className={cn('w-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}>
            {parts.map((part, index) => (
              part.type === 'mermaid' ? (
                <MermaidCodeBlock key={`mermaid-${index}`}>
                  {part.content}
                </MermaidCodeBlock>
              ) : (
                <Streamdown
                  key={`text-${index}`}
                  components={listComponents}
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  {...props}
                >
                  {part.content}
                </Streamdown>
              )
            ))}
          </div>
        );
      }
    }

    // Default: show regular Streamdown content
    return (
      <Streamdown
        className={cn(
          'w-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          className
        )}
        components={listComponents}
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        {...props}
      >
        {children}
      </Streamdown>
    );
  }
);

Response.displayName = 'Response';
