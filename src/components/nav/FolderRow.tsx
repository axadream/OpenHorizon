import type { KeyboardEvent, MouseEvent } from 'react';
import { ChevronRight, Folder as FolderIcon, FolderOpen, MoreHorizontal } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Folder } from '@/db/schema';
import { cn } from '@/lib/cn';
import { InlineRename, NavRowBadge, NavRowButton } from '@/components/nav/NavRow';

export interface FolderRowProps {
  folder: Folder;
  unreadCount: number;
  selected: boolean;
  expanded: boolean;
  rail: boolean;
  renaming: boolean;
  /** id of the feed list this row controls (aria-controls). */
  childrenId: string;
  onToggle(): void;
  onSelect(): void;
  onContextMenu(e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, folder: Folder): void;
  onRenameCommit(name: string): void;
  onRenameCancel(): void;
}

/**
 * Folder header. The chevron (expanded/collapsed toggle, persisted on the folder) and the name
 * (selects the folder view) are two separate tab stops. In rail mode only the folder icon shows.
 */
export function FolderRow({
  folder,
  unreadCount,
  selected,
  expanded,
  rail,
  renaming,
  childrenId,
  onToggle,
  onSelect,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
}: FolderRowProps) {
  if (renaming) {
    return (
      <li className="px-2">
        <InlineRename label="Folder name" initial={folder.name} onCommit={onRenameCommit} onCancel={onRenameCancel} />
      </li>
    );
  }

  const label = `${folder.name}, ${unreadCount} unread`;
  const Icon = expanded ? FolderOpen : FolderIcon;

  const nameButton = (
    <NavRowButton
      data-nav-item
      data-folder-row={folder.id}
      selected={selected}
      rail={rail}
      aria-label={rail ? label : undefined}
      aria-expanded={rail ? undefined : expanded}
      aria-controls={childrenId}
      className={cn(!rail && 'flex-1')}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, folder);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
          e.preventDefault();
          onContextMenu(e, folder);
        }
      }}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0 text-text-muted" />
      {rail ? null : <span className="min-w-0 flex-1 truncate font-medium text-silver">{folder.name}</span>}
      <NavRowBadge count={unreadCount} selected={selected} rail={rail} />
    </NavRowButton>
  );

  return (
    <li className={cn('group relative', rail ? 'flex justify-center' : 'flex items-center')}>
      {rail ? (
        <Tooltip content={folder.name}>{nameButton}</Tooltip>
      ) : (
        <>
          <button
            type="button"
            data-nav-item
            data-folder-toggle={folder.id}
            aria-expanded={expanded}
            aria-controls={childrenId}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} folder ${folder.name}`}
            onClick={onToggle}
            className="focus-ring flex size-8 shrink-0 items-center justify-center rounded-sm text-text-muted hover:bg-card hover:text-text"
          >
            <ChevronRight
              aria-hidden="true"
              size={16}
              strokeWidth={1.75}
              className={cn('transition-transform duration-[var(--duration-base)] ease-standard', expanded && 'rotate-90')}
            />
          </button>
          {nameButton}
          <IconButton
            label={`More actions for folder ${folder.name}`}
            icon={MoreHorizontal}
            size="sm"
            tabIndex={-1}
            aria-haspopup="menu"
            className="ml-0.5 opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100"
            onClick={(e) => onContextMenu(e, folder)}
          />
        </>
      )}
    </li>
  );
}
