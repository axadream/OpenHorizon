import type { SharePayload } from '@/store/types';

/*
 * Share URL templates (DESIGN §6.11). T = title, U = url, X = text ?? title.
 * Every parameter is encodeURIComponent-ed.
 */

export type ShareTargetId = 'x' | 'whatsapp' | 'telegram' | 'reddit' | 'linkedin' | 'facebook' | 'email';

export interface ShareTargetDef {
  id: ShareTargetId;
  label: string;
  href(payload: SharePayload): string;
}

const enc = encodeURIComponent;

function parts(p: SharePayload): { T: string; U: string; X: string } {
  return { T: enc(p.title), U: enc(p.url), X: enc(p.text ?? p.title) };
}

export const SHARE_TARGETS: readonly ShareTargetDef[] = [
  {
    id: 'x',
    label: 'X',
    href: (p) => {
      const { X, U } = parts(p);
      return `https://x.com/intent/post?text=${X}&url=${U}`;
    },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    href: (p) => {
      const { X, U } = parts(p);
      return `https://wa.me/?text=${X}%20${U}`;
    },
  },
  {
    id: 'telegram',
    label: 'Telegram',
    href: (p) => {
      const { X, U } = parts(p);
      return `https://t.me/share/url?url=${U}&text=${X}`;
    },
  },
  {
    id: 'reddit',
    label: 'Reddit',
    href: (p) => {
      const { T, U } = parts(p);
      return `https://www.reddit.com/submit?url=${U}&title=${T}`;
    },
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    href: (p) => {
      const { U } = parts(p);
      return `https://www.linkedin.com/sharing/share-offsite/?url=${U}`;
    },
  },
  {
    id: 'facebook',
    label: 'Facebook',
    href: (p) => {
      const { U } = parts(p);
      return `https://www.facebook.com/sharer/sharer.php?u=${U}`;
    },
  },
  {
    id: 'email',
    label: 'Email',
    href: (p) => {
      const { T, U, X } = parts(p);
      return `mailto:?subject=${T}&body=${X}%0A%0A${U}`;
    },
  },
];

export function shareTargetHref(id: ShareTargetId, payload: SharePayload): string {
  const def = SHARE_TARGETS.find((t) => t.id === id);
  if (!def) throw new Error(`Unknown share target: ${id}`);
  return def.href(payload);
}

/**
 * Copy text to the clipboard. Uses the async Clipboard API when available, otherwise a hidden
 * textarea with document.execCommand('copy'). Resolves to whether the copy succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the execCommand path (permission denied, insecure context, ...).
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    ta.remove();
  }
  return ok;
}
