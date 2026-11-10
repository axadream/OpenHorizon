import { useUiStore } from '@/store/uiStore';
import { useAiPanelStore } from './aiPanelStore';
import { isAiReady } from './orchestrator';

/*
 * Entry points for the reader button and the article action sheet. Loaded with a dynamic import from
 * page code only, so the AI modules stay out of the initial bundle. Not reachable from sw.ts.
 */

/** Open Settings at the AI section. */
export function openAiSettings(): void {
  useUiStore.getState().openDialog('settings', { section: 'ai' });
}

/** Reader button: open or close the summary panel, or open Settings when AI is not set up. */
export async function toggleAiSummary(articleId: string): Promise<void> {
  if (!(await isAiReady())) {
    openAiSettings();
    return;
  }
  useAiPanelStore.getState().toggle(articleId);
}

/** Action sheet: always open the panel for the article (the sheet selects the article first). */
export async function requestAiSummary(articleId: string): Promise<void> {
  if (!(await isAiReady())) {
    openAiSettings();
    return;
  }
  useAiPanelStore.getState().show(articleId);
}
