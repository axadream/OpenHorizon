import { create } from 'zustand';

/*
 * Which article's AI summary panel is open. Plain state with no AI logic, so the reader can read it
 * without loading the AI modules. The panel itself is lazy-loaded.
 */

export interface AiPanelState {
  /** Article whose summary panel is open, or null. */
  articleId: string | null;
  show(articleId: string): void;
  hide(): void;
  toggle(articleId: string): void;
  /** Close the panel when the reader moves to another article. */
  syncArticle(articleId: string): void;
}

export const useAiPanelStore = create<AiPanelState>()((set, get) => ({
  articleId: null,
  show: (articleId) => set({ articleId }),
  hide: () => set({ articleId: null }),
  toggle: (articleId) => set({ articleId: get().articleId === articleId ? null : articleId }),
  syncArticle: (articleId) => {
    const current = get().articleId;
    if (current !== null && current !== articleId) set({ articleId: null });
  },
}));

export function useAiPanelArticleId(): string | null {
  return useAiPanelStore((s) => s.articleId);
}
