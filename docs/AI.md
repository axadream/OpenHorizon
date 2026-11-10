# AI summaries

Status: v1 (page code only). Read with `docs/ARCHITECTURE.md`.

The reader can summarise an article, list its key takeaways and suggest tags. It runs on the device or on a server you run by default. A cloud provider is opt-in, needs an API key, and is never used before you accept a consent dialog for it.

## Architecture

All code lives in `src/features/ai/` (logic) and `src/components/` (UI). None of it is reachable from `src/sw.ts`, and the AI modules load with dynamic `import()` from page code only: the reader's Summarize button, the article action sheet, the Settings dialog and the reader's summary panel. `dist/sw.js` contains no `import(` calls.

| Piece | File | Role |
|---|---|---|
| Provider interface | `providers/` + `types.ts` | `AiProvider.generate(input)` returns `summary`, `takeaways`, `tags`, plus provider id, model and privacy class |
| Chrome built-in | `providers/chromeBuiltin.ts` | Summarizer API (`tldr` and `key-points`), Prompt API for tags when ready |
| OpenAI-compatible | `providers/openAiCompatible.ts` | One client for `/chat/completions` (SSE streaming, non-streaming fallback, `response_format` retry), `/models` listing, connection test |
| Heuristic | `providers/heuristic.ts`, `heuristic.ts` | Offline lead sentences, key sentences and keyword tags, no model |
| Config | `config.ts`, `presets.ts`, `endpoint.ts` | Presets, base address normalisation, privacy classification, mixed-content check |
| Consent | `consent.ts` | Cloud consent records; `assertCloudConsent` runs before every request |
| Keys | `apiKey.ts` | sessionStorage by default, settings table only when remembered |
| Prompt | `buildPrompt.ts` | Delimited article, injection rules, language directive |
| Parsing | `sse.ts`, `parseAiJson.ts` | SSE parser, tolerant JSON recovery, plain-text output |
| Cache | `cache.ts`, `articleText.ts` | Result on the article row, reused by text hash and UI language |
| Errors | `errors.ts` | Friendly diagnosis of CORS, mixed content, 401/403, 429, model not found, offline |
| Orchestration | `orchestrator.ts`, `openSummary.ts` | Cache check, provider choice, activity bar, chimes |

### Provider interface

```ts
interface AiProvider {
  readonly id: ProviderId;        // settings provider, or 'heuristic'
  readonly privacy: AiPrivacy;    // 'on-device' | 'local' | 'cloud'
  generate(input: GenerateInput): Promise<ProviderResult>;
}
```

`GenerateInput` carries the title, URL, capped text (12 000 characters), UI locale, resolved instructions, an `AbortSignal` and an `onPartial` callback for streaming.

### Providers

- **chrome-builtin** (default, on-device). Uses `Summarizer` (feature-detected). Summary with `tldr`, takeaways with `key-points`. Tags come from the Prompt API only when it is already `available`; otherwise from the keyword heuristic. Output language is `en`, `es` or `ja`; any other UI language falls back to English and the panel says so. If the summarizer is unavailable, the heuristic is used and the panel says that too. A model download is shown in the global activity bar.
- **ollama**, **lmstudio** (local). OpenAI-style base addresses on `localhost`. No key. Ollama also lists models at `/api/tags`.
- **openai**, **mistral**, **deepseek**, **gemini** (cloud). Fixed addresses, API key required.
- **custom**. Any OpenAI-style address. Its privacy class follows the address: loopback and private network hosts are local, anything else is cloud.
- **heuristic** (fallback). `leadSummary`, `keySentences` and `extractKeywords`, with stop-word lists for English and Romanian.

### What is not bundled, and why

WebLLM and Transformers.js are not included. Their model weights run to hundreds of megabytes and need WebGPU, which many devices lack. The provider interface leaves room for them; a new provider is one file plus a preset.

## Privacy classes and what is sent

| Class | Where the text goes | Consent |
|---|---|---|
| on-device | Nowhere. Chrome's built-in model runs in the browser. | none |
| local | A server you run (`localhost`, a LAN host, `*.local`) | none |
| cloud | The provider's host (or a custom host that is not local) | required, per provider (per `provider:host` for address-classified providers) |

For a cloud request the consent dialog lists exactly what is sent: the article title, its URL, up to 12 000 characters of text, your instructions and, if one is set, your API key in the `Authorization` header. The "Test connection" and "Fetch models" buttons also need consent, and then only the test prompt or the key is listed.

Requests are sent with `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`.

## Prompt-injection rules

Article text is untrusted data. The system message says the text between `<article>` and `</article>` is content to summarise and never instructions. It tells the model to ignore commands and links inside it, to use no tools and to answer only with the JSON object. A closing marker inside the article is escaped so it cannot end the block early. Model output is plain text: HTML is stripped from every field, and the panel renders it with `MarkdownLite` (React elements, never `innerHTML`).

## Settings and storage

Settings > AI summaries stores these keys in the Dexie `settings` table: `aiEnabled` (off by default), `aiProvider` (default `chrome-builtin`), `aiBaseUrl`, `aiModel`, `aiInstructions` (empty means the localised default), `aiRememberKey`, `aiApiKey` (written only when remembered), `aiCloudConsent` (provider key to accepted time).

The API key is held in `sessionStorage` for the tab unless "Remember key on this device" is on. Remembering stores it in plain text in the browser profile. The key is never logged, never placed in a URL and never exported. The OPML export does not read settings at all, and a unit test checks that the key and AI settings do not appear in it.

Results are cached on the article row as `ai` (no index, no Dexie version change). A cached result is reused only when the source text hash and the UI language match. Loading the full article clears it, and retention keeps articles that have one, as it does for favorites.

## Running Ollama for OpenHorizon

Ollama accepts only `localhost` origins by default. When OpenHorizon runs on another origin (for example the GitHub Pages site), allow that origin and restart Ollama:

- Windows: set the user environment variable `OLLAMA_ORIGINS=https://axadream.github.io`, then quit and restart Ollama.
- macOS: `launchctl setenv OLLAMA_ORIGINS https://axadream.github.io`, then restart Ollama.
- Linux (systemd): add `Environment="OLLAMA_ORIGINS=https://axadream.github.io"` to the service and restart it.

The app shows this hint, with the origin it found, when a CORS block is detected. A page served over https cannot call an `http://` address on your network (the browser blocks mixed content), so use an https address or `localhost`.

## Chrome built-in AI requirements

The Summarizer and Prompt APIs need desktop Chrome with the built-in model (Gemini Nano) installed on a device that meets Chrome's hardware requirements. Depending on the Chrome version the APIs can sit behind `chrome://flags` entries (search for "Summarization API for Gemini Nano" or "Prompt API for Gemini Nano"). Settings > AI shows the state: available, can be downloaded (with a download button and progress in the activity bar), downloading, or not available in this browser.

## Tests

`src/features/ai/*.test.ts` cover the SSE parser (chunk boundaries, `[DONE]`, malformed lines), JSON recovery, prompt delimiters and language directive, the keyword and sentence heuristics (English and Romanian), provider config and URL normalisation, Chrome availability mapping with a mocked `Summarizer`, consent gating (no `fetch` call without consent), streaming through the client, error diagnosis, the cache and its invalidation, and the export check.
