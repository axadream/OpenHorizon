import changelog from '../../../CHANGELOG.md?raw';
import { Dialog } from '@/components/ui/Dialog';
import { MarkdownLite } from '@/lib/markdownLite';
import { useDialog } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';

/**
 * Release notes, rendered from the root CHANGELOG.md (bundled as raw text). Stacks above
 * Settings: the native dialogs share the top layer, and closing this one returns focus to
 * the button that opened it.
 */
export function ChangelogDialog() {
  const payload = useDialog('changelog');
  const open = payload !== false;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useUiStore.getState().closeDialog('changelog');
      }}
      title="Release notes"
    >
      {open ? <MarkdownLite source={changelog} /> : null}
    </Dialog>
  );
}
