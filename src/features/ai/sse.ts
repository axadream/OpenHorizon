/*
 * Server-Sent Events parser for OpenAI-style streams. Pure: feed it text chunks in any split and it
 * calls onData once per complete event. Handles LF, CRLF and CR line endings, lines split across
 * chunks (including a CRLF split between two chunks), comment lines, multi-line data fields and the
 * terminal "data: [DONE]" event. Malformed lines are ignored, never thrown.
 */

export interface SseHandlers {
  /** One event's data (multiple data lines joined with a newline). Not called for [DONE]. */
  onData(data: string): void;
  /** Called once when the terminal [DONE] event arrives. Later input is ignored. */
  onDone?(): void;
}

export interface SseParser {
  push(chunk: string): void;
  /** Flush a last line without a trailing newline and any pending event. */
  end(): void;
}

export function createSseParser(handlers: SseHandlers): SseParser {
  let buffer = '';
  let dataLines: string[] = [];
  let finished = false;

  const dispatch = (): void => {
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    dataLines = [];
    if (data === '[DONE]') {
      finished = true;
      handlers.onDone?.();
      return;
    }
    handlers.onData(data);
  };

  const handleLine = (raw: string): void => {
    if (raw === '') {
      dispatch();
      return;
    }
    if (raw.startsWith(':')) return;
    const colon = raw.indexOf(':');
    const field = colon === -1 ? raw : raw.slice(0, colon);
    let value = colon === -1 ? '' : raw.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    // Only data fields matter here; event, id and retry are ignored.
    if (field === 'data') dataLines.push(value);
  };

  return {
    push(chunk: string): void {
      if (finished) return;
      buffer += chunk;
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch !== '\n' && ch !== '\r') continue;
        // A lone CR at the end of the buffer may be the first half of a CRLF: wait for more input.
        if (ch === '\r' && i + 1 === buffer.length) break;
        handleLine(buffer.slice(start, i));
        if (ch === '\r' && buffer[i + 1] === '\n') i++;
        start = i + 1;
        if (finished) break;
      }
      buffer = buffer.slice(start);
    },
    end(): void {
      if (finished) return;
      if (buffer !== '') handleLine(buffer);
      buffer = '';
      dispatch();
    },
  };
}

export interface ChatChunk {
  /** Text added by this chunk (choices[0].delta.content). */
  delta?: string;
  /** Error object sent inside the stream. */
  error?: string;
}

/** Parse one SSE data payload of a chat completion. Null when it is not valid JSON. */
export function parseChatChunk(data: string): ChatChunk | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as {
    choices?: { delta?: { content?: unknown } }[];
    error?: { message?: unknown } | string;
  };
  if (obj.error) {
    const message = typeof obj.error === 'string' ? obj.error : String(obj.error.message ?? 'error');
    return { error: message };
  }
  const content = obj.choices?.[0]?.delta?.content;
  return typeof content === 'string' ? { delta: content } : {};
}
