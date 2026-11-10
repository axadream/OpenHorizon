import { Input } from '@/components/ui/Input';
import { t, useT } from '@/i18n/i18n';
import { useSearchQuery } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';

export interface NavSearchProps {
  /** Called on Escape; the owner closes the field and clears the query. */
  onClose(): void;
}

/** Feed filter field. Writes the query to the store; NavPane filters the feed list by title. */
export function NavSearch({ onClose }: NavSearchProps) {
  useT();
  const query = useSearchQuery();
  return (
    <div role="search" className="px-2 pt-2">
      <Input
        id="nav-search"
        type="search"
        aria-label={t('nav.filterFeeds')}
        placeholder={t('nav.filterFeeds')}
        autoFocus
        value={query}
        onChange={(e) => useUiStore.getState().setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
        className="h-9 text-sm"
      />
    </div>
  );
}
