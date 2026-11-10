/*
 * Minimal typings for Chrome's built-in AI globals (Summarizer and Prompt API). The DOM lib does not
 * declare them, so they are described here and always feature-detected at runtime.
 */

export interface ChromeModelMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}

export interface SummarizerCreateOptions {
  type: 'tldr' | 'key-points';
  format: 'markdown' | 'plain-text';
  length: 'short' | 'medium' | 'long';
  sharedContext?: string;
  outputLanguage?: string;
  monitor?(monitor: ChromeModelMonitor): void;
}

export interface SummarizerSession {
  summarize(text: string, options?: { context?: string }): Promise<string>;
  summarizeStreaming?(text: string, options?: { context?: string }): ReadableStream<string> | AsyncIterable<string>;
  destroy(): void;
}

export interface SummarizerApi {
  availability(options?: { outputLanguage?: string }): Promise<string>;
  create(options: SummarizerCreateOptions): Promise<SummarizerSession>;
}

export interface LanguageModelCreateOptions {
  initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
  outputLanguage?: string;
  monitor?(monitor: ChromeModelMonitor): void;
}

export interface LanguageModelSession {
  prompt(input: string): Promise<string>;
  destroy(): void;
}

export interface LanguageModelApi {
  availability(options?: { outputLanguage?: string }): Promise<string>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

export interface ChromeAiGlobals {
  Summarizer?: SummarizerApi;
  LanguageModel?: LanguageModelApi;
}

/** The global scope, typed for the optional Chrome APIs. Look up at call time (tests stub these). */
export function chromeAiGlobals(): ChromeAiGlobals {
  return globalThis as unknown as ChromeAiGlobals;
}
