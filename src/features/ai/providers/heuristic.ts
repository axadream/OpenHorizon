import { heuristicDraft } from '../heuristic';
import type { AiProvider, GenerateInput, ProviderResult } from '../types';

/**
 * Offline fallback with no model: lead sentences, key sentences and keyword tags. Used when Chrome's
 * built-in AI is not available. Always available, and never sends anything anywhere.
 */
export const heuristicProvider: AiProvider = {
  id: 'heuristic',
  privacy: 'on-device',

  async generate(input: GenerateInput): Promise<ProviderResult> {
    const draft = heuristicDraft(input.text, input.locale);
    input.onPartial({ summary: draft.summary });
    return {
      ...draft,
      provider: 'heuristic',
      model: '',
      privacy: 'on-device',
      notes: ['ai.note.heuristicFallback'],
    };
  },
};
