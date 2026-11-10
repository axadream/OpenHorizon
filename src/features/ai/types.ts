import type { AiProviderId } from '@/db/schema';
import type { Locale } from '@/i18n/types';

/** Where the text goes. on-device: this browser. local: a server the user runs. cloud: anything else. */
export type AiPrivacy = 'on-device' | 'local' | 'cloud';

/** Availability of a built-in model, as reported by the browser. */
export type AiAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

/** Explanations shown next to a result (i18n keys). */
export type AiNoteKey = 'ai.note.englishOutput' | 'ai.note.heuristicFallback' | 'ai.note.heuristicTags';

/** Providers that can produce a draft: the settings providers plus the offline heuristic fallback. */
export type ProviderId = AiProviderId | 'heuristic';

/** The four-part result every provider returns. */
export interface ArticleDraft {
  summary: string;
  takeaways: string[];
  tags: string[];
}

/** Partial output streamed while a provider works. */
export type DraftPatch = Partial<ArticleDraft>;

export interface GenerateInput {
  title: string;
  url: string;
  /** Cleaned, capped article text (see prepareArticleText). Untrusted data. */
  text: string;
  locale: Locale;
  /** Resolved user instructions (never empty; the default is localized). */
  instructions: string;
  signal: AbortSignal;
  onPartial(patch: DraftPatch): void;
}

export interface ProviderResult extends ArticleDraft {
  provider: ProviderId;
  /** Model name, or '' when the provider has none to name. */
  model: string;
  privacy: AiPrivacy;
  notes: AiNoteKey[];
}

export interface AiProvider {
  readonly id: ProviderId;
  readonly privacy: AiPrivacy;
  generate(input: GenerateInput): Promise<ProviderResult>;
}
