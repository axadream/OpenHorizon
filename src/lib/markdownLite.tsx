import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { parseMarkdownLite, type MdBlock, type MdInline } from '@/lib/markdownParse';

/*
 * Dependency-free renderer for the CHANGELOG subset. Produces React elements only; the
 * source is never inserted as HTML. Heading levels are shifted down one step because the
 * dialog title already occupies h2.
 */

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: 'text-lg font-semibold tracking-[-0.01em] text-text',
  2: 'pt-1 text-base font-semibold text-text',
  3: 'text-xs font-semibold tracking-[0.06em] text-text-muted uppercase',
};

const LINK_CLASS =
  'focus-ring rounded-xs text-accent underline decoration-[rgba(0,180,216,0.4)] underline-offset-2 hover:text-accent-hover hover:decoration-current';

function renderInline(nodes: readonly MdInline[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.value}</Fragment>;
      case 'strong':
        return (
          <strong key={key} className="font-semibold text-text">
            {renderInline(node.children, key)}
          </strong>
        );
      case 'code':
        return (
          <code key={key} className="rounded-xs bg-card px-1 py-px font-mono text-[0.9em] text-silver">
            {node.value}
          </code>
        );
      case 'link':
        return (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {renderInline(node.children, key)}
          </a>
        );
    }
  });
}

function renderBlock(block: MdBlock, key: string): ReactNode {
  switch (block.type) {
    case 'heading': {
      const children = renderInline(block.children, key);
      if (block.level === 1) return <h3 key={key} className={HEADING_CLASS[1]}>{children}</h3>;
      if (block.level === 2) return <h4 key={key} className={HEADING_CLASS[2]}>{children}</h4>;
      return <h5 key={key} className={HEADING_CLASS[3]}>{children}</h5>;
    }
    case 'list':
      return (
        <ul key={key} className="flex list-disc flex-col gap-1.5 pl-5 marker:text-text-faint">
          {block.items.map((item, i) => (
            <li key={`${key}-${i}`} className="leading-6">
              {renderInline(item, `${key}-${i}`)}
            </li>
          ))}
        </ul>
      );
    case 'paragraph':
      return (
        <p key={key} className="leading-6">
          {renderInline(block.children, key)}
        </p>
      );
  }
}

export interface MarkdownLiteProps {
  source: string;
  className?: string;
}

/** Renders the supported Markdown subset as React elements. */
export function MarkdownLite({ source, className }: MarkdownLiteProps) {
  const blocks = parseMarkdownLite(source);
  return (
    <div className={cn('flex flex-col gap-3 text-sm text-silver', className)}>
      {blocks.map((block, i) => renderBlock(block, `b${i}`))}
    </div>
  );
}
