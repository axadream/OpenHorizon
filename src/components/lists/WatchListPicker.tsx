import { useId } from 'react';
import { Input } from '@/components/ui/Input';
import type { Feed } from '@/db/schema';
import { NEW_LIST_VALUE } from '@/features/lists/lists';
import { t, useT } from '@/i18n/i18n';

export interface WatchListPickerProps {
  lists: readonly Feed[];
  /** A watch list id, or NEW_LIST_VALUE. */
  value: string;
  newName: string;
  onValueChange(value: string): void;
  onNewNameChange(name: string): void;
  disabled?: boolean;
}

const SELECT =
  'h-9 w-full rounded-sm border border-border-strong bg-bg px-3 text-base text-text shadow-[var(--inner-well)] focus-ring disabled:opacity-50 disabled:pointer-events-none';

/** Choose an existing watch list or "New list…" with a name field (default "Watch later"). */
export function WatchListPicker({ lists, value, newName, onValueChange, onNewNameChange, disabled = false }: WatchListPickerProps) {
  useT();
  const uid = useId();
  const selectId = `${uid}-list`;
  const nameId = `${uid}-name`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="text-sm font-medium text-silver">
        {t('lists.picker')}
      </label>
      <select
        id={selectId}
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
        className={SELECT}
      >
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.title}
          </option>
        ))}
        <option value={NEW_LIST_VALUE}>{t('lists.newList')}</option>
      </select>
      {value === NEW_LIST_VALUE ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={nameId} className="text-sm font-medium text-silver">
            {t('lists.newListName')}
          </label>
          <Input
            id={nameId}
            type="text"
            autoComplete="off"
            value={newName}
            disabled={disabled}
            placeholder={t('lists.watchTitle')}
            onChange={(e) => onNewNameChange(e.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
