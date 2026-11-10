import { useEffect } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useUiStore } from '@/store/uiStore';
import type { MobilePane } from '@/store/types';

interface PaneHistoryState {
  ohPane?: MobilePane;
}

function isPane(value: unknown): value is MobilePane {
  return value === 'nav' || value === 'timeline' || value === 'reader';
}

/**
 * Mobile only: every forward pane move pushes a history entry, so the browser back button
 * steps back one pane instead of leaving the app. Desktop is unaffected.
 */
export function useMobileHistory(): void {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile) return;

    let restoring = false;
    const initial: PaneHistoryState = { ohPane: useUiStore.getState().mobilePane };
    window.history.replaceState(initial, '');

    const unsubscribe = useUiStore.subscribe(
      (s) => s.mobilePane,
      (pane, previous) => {
        if (restoring || pane === previous) return;
        const entry: PaneHistoryState = { ohPane: pane };
        window.history.pushState(entry, '');
      },
    );

    const onPop = (event: PopStateEvent) => {
      const state = event.state as PaneHistoryState | null;
      const pane: MobilePane = state && isPane(state.ohPane) ? state.ohPane : 'timeline';
      restoring = true;
      useUiStore.getState().setMobilePane(pane);
      restoring = false;
    };
    window.addEventListener('popstate', onPop);

    return () => {
      unsubscribe();
      window.removeEventListener('popstate', onPop);
    };
  }, [isMobile]);
}
