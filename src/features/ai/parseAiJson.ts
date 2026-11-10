import type { ArticleDraft } from './types';

/*
 * Tolerant parsing of model output. Models often wrap JSON in prose or code fences, leave trailing
 * commas, or stop mid-object when the output is cut. Everything here is pure and never throws.
 * Output is plain text: HTML tags are removed from every field before it is shown.
 */

export const MAX_TAKEAWAYS = 6;
export const MAX_TAGS = 6;

/** Remove HTML comments and tags, then collapse whitespace. */
export function plainModelText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first JSON object in the text: code fences removed, then the first balanced {...} block. A
 * truncated object is closed (open strings, arrays and braces) so the partial answer can still be used.
 */
export function extractJsonObject(raw: string): string | null {
  const text = raw.replace(/^﻿/, '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  if (start === -1) return null;

  const closers: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') closers.push('}');
    else if (ch === '[') closers.push(']');
    else if (ch === '}' || ch === ']') {
      closers.pop();
      if (closers.length === 0) return body.slice(start, i + 1);
    }
  }

  // Truncated output: close the open string, drop a dangling comma and close what is still open.
  let partial = body.slice(start);
  if (escaped) partial = partial.slice(0, -1);
  if (inString) partial += '"';
  partial = partial.replace(/,\s*$/, '');
  return partial + closers.reverse().join('');
}

function parseLoose(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    // Trailing commas before a closing bracket are the most common model mistake.
    try {
      return JSON.parse(candidate.replace(/,(\s*[}\]])/g, '$1'));
    } catch {
      return undefined;
    }
  }
}

function clean(value: string): string {
  return plainModelText(value);
}

/** Strings from an array, or a comma/semicolon/newline separated string. */
function listOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string').map(clean);
  if (typeof value === 'string') return value.split(/[,;\n]/).map(clean);
  return [];
}

function unique(values: string[], max: number, keyOf: (v: string) => string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const key = keyOf(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length === max) break;
  }
  return out;
}

/** Validate and normalise a parsed value into a draft. Null when nothing usable is present. */
export function normalizeDraft(value: unknown): ArticleDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const summary = clean(
    typeof r.summary === 'string' ? r.summary : Array.isArray(r.summary) ? listOf(r.summary).join(' ') : '',
  );
  const takeaways = unique(
    listOf(r.takeaways).map((s) => s.replace(/^[-*•]\s+/, '')),
    MAX_TAKEAWAYS,
    (s) => s.toLowerCase(),
  );
  const tags = unique(
    listOf(r.tags).map((s) => s.replace(/^#+/, '').trim().toLowerCase()),
    MAX_TAGS,
    (s) => s,
  );
  if (!summary && takeaways.length === 0 && tags.length === 0) return null;
  return { summary, takeaways, tags };
}

/** Parse a model reply that should be the JSON object. Null when it cannot be recovered. */
export function parseAiJson(raw: string): ArticleDraft | null {
  const candidate = extractJsonObject(raw);
  if (!candidate) return null;
  return normalizeDraft(parseLoose(candidate));
}

/**
 * The summary value of a JSON object still being streamed. Returns the decoded text so far, or null
 * when the "summary" key has not started. Escape sequences are decoded; an unfinished one is dropped.
 */
export function partialSummary(buffer: string): string | null {
  const m = /"summary"\s*:\s*"/.exec(buffer);
  if (!m) return null;
  let i = m.index + m[0].length;
  let raw = '';
  while (i < buffer.length) {
    const ch = buffer[i] ?? '';
    if (ch === '\\') {
      if (i + 1 >= buffer.length) break;
      raw += ch + (buffer[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (ch === '"') break;
    raw += ch;
    i++;
  }
  try {
    return plainModelText(JSON.parse(`"${raw}"`) as string);
  } catch {
    return null;
  }
}

/** Bullet lines of a Markdown-ish reply (for the Summarizer key-points output). Up to MAX_TAKEAWAYS. */
export function parseBullets(text: string): string[] {
  const bullets: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/.exec(line);
    if (m?.[1]) bullets.push(m[1]);
  }
  const source = bullets.length > 0 ? bullets : text.split(/\r?\n/).filter((l) => l.trim() !== '');
  return unique(
    source.map((s) => clean(s.replace(/\*\*/g, ''))),
    MAX_TAKEAWAYS,
    (s) => s.toLowerCase(),
  );
}

/** Tags from a free-form reply: commas, semicolons, newlines or bullets. Lowercase, no '#', max MAX_TAGS. */
export function parseTagList(text: string): string[] {
  const parts = text
    .split(/[,;\n]/)
    .map((p) => p.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/^#+/, '').replace(/["'`.]+$/g, '').trim().toLowerCase())
    .filter((p) => p.length >= 2 && p.length <= 40);
  return unique(parts, MAX_TAGS, (s) => s);
}
