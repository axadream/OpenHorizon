import { useId } from 'react';
import { Input } from '@/components/ui/Input';
import { useFolders } from '@/features/feeds/feedQueries';
import { createFolder } from '@/features/feeds/folders';

/** Select value that means "create a folder named by the text field". */
export const NEW_FOLDER = '__new__';

export interface FolderPickerProps {
  /** '' (no folder), a folder id, or NEW_FOLDER. */
  value: string;
  onValueChange(value: string): void;
  newName: string;
  onNewNameChange(name: string): void;
  disabled?: boolean;
}

export function FolderPicker({ value, onValueChange, newName, onNewNameChange, disabled }: FolderPickerProps) {
  const selectId = useId();
  const nameId = useId();
  const folders = useFolders() ?? [];

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="text-sm font-medium text-silver">
        Folder
      </label>
      <select
        id={selectId}
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
        className="h-9 w-full rounded-sm border border-border-strong bg-bg px-3 text-base text-text shadow-[var(--inner-well)] focus-ring disabled:opacity-50"
      >
        <option value="">No folder</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
        <option value={NEW_FOLDER}>New folder…</option>
      </select>
      {value === NEW_FOLDER ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={nameId} className="text-sm font-medium text-silver">
            New folder name
          </label>
          <Input
            id={nameId}
            value={newName}
            disabled={disabled}
            maxLength={80}
            placeholder="Folder name"
            onChange={(e) => onNewNameChange(e.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Folder id for a picker value. Creates the folder first when "New folder…" is selected
 * (createFolder returns an existing folder with the same name instead of duplicating it).
 */
export async function resolveFolderId(value: string, newName: string): Promise<string | null> {
  if (value === NEW_FOLDER) {
    const name = newName.trim();
    if (!name) throw new Error('Enter a name for the new folder');
    return (await createFolder(name)).id;
  }
  return value || null;
}
