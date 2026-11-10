import { describe, expect, it } from 'vitest';
import { createSseParser, parseChatChunk } from './sse';

function run(chunks: string[]): { events: string[]; done: number } {
  const events: string[] = [];
  let done = 0;
  const parser = createSseParser({
    onData: (data) => events.push(data),
    onDone: () => {
      done++;
    },
  });
  for (const chunk of chunks) parser.push(chunk);
  parser.end();
  return { events, done };
}

describe('createSseParser', () => {
  it('gives the same events however the stream is split into chunks', () => {
    const text = 'data: {"a":1}\n\ndata: {"a":2}\n\n';
    for (let i = 0; i <= text.length; i++) {
      expect(run([text.slice(0, i), text.slice(i)]).events).toEqual(['{"a":1}', '{"a":2}']);
    }
  });

  it('handles a CRLF pair split between two chunks', () => {
    expect(run(['data: x\r', '\n\r', '\n']).events).toEqual(['x']);
  });

  it('accepts CR-only line endings', () => {
    expect(run(['data: one\r\rdata: two\r\r']).events).toEqual(['one', 'two']);
  });

  it('ignores comments, event and id fields, and malformed lines', () => {
    const { events } = run(['retry: 1000\n: keep-alive\nevent: message\ngarbage line\nid: 7\ndata: ok\n\n']);
    expect(events).toEqual(['ok']);
  });

  it('joins several data lines of one event with a newline', () => {
    expect(run(['data: a\ndata: b\n\n']).events).toEqual(['a\nb']);
  });

  it('stops at [DONE] and ignores anything after it', () => {
    const { events, done } = run(['data: 1\n\ndata: [DONE]\n\ndata: 2\n\n']);
    expect(events).toEqual(['1']);
    expect(done).toBe(1);
  });

  it('flushes a last event that has no trailing blank line', () => {
    expect(run(['data: tail']).events).toEqual(['tail']);
  });
});

describe('parseChatChunk', () => {
  it('reads the delta text', () => {
    expect(parseChatChunk('{"choices":[{"delta":{"content":"Hi"}}]}')).toEqual({ delta: 'Hi' });
  });

  it('returns an empty chunk for a role-only or empty delta', () => {
    expect(parseChatChunk('{"choices":[{"delta":{"role":"assistant"}}]}')).toEqual({});
  });

  it('reads an error object sent inside the stream', () => {
    expect(parseChatChunk('{"error":{"message":"quota exceeded"}}')).toEqual({ error: 'quota exceeded' });
  });

  it('returns null for malformed JSON instead of throwing', () => {
    expect(parseChatChunk('{"choices":[')).toBeNull();
    expect(parseChatChunk('"text"')).toBeNull();
  });
});
