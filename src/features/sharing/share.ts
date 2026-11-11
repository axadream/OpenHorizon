import { useUiStore } from '@/store/uiStore';
import type { SharePayload } from '@/store/types';
import { t } from '@/i18n/i18n';

export type ShareOutcome = 'native' | 'sheet' | 'cancelled';

/** Branded share line: "Shared via OpenHorizon app | {title}". Empty titles fall back to the app name. */
export function brandedShareText(title: string): string {
  return t('share.branded', { title: title.trim() || t('share.appName') });
}

/** Payload with the title kept as-is (email subject, Reddit title) and the text branded. */
export function brandedPayload(payload: SharePayload): SharePayload {
  return {
    title: payload.title,
    url: payload.url,
    text: brandedShareText(payload.text ?? payload.title),
  };
}

/** Text for "Copy link": branded line, newline, URL. */
export function copyShareText(payload: SharePayload): string {
  return `${payload.text ?? brandedShareText(payload.title)}\n${payload.url}`;
}

/**
 * Share through the OS sheet when available (ARCHITECTURE §9), otherwise open the in-app
 * ShareSheet. Must be called from a user gesture (click or keydown).
 */
export async function share(payload: SharePayload): Promise<ShareOutcome> {
  const data: SharePayload = brandedPayload(payload);
  const canNative =
    typeof navigator.share === 'function' &&
    (typeof navigator.canShare === 'function' ? navigator.canShare(data) : true);

  if (canNative) {
    try {
      await navigator.share(data);
      return 'native';
    } catch (e) {
      // The user dismissed the native sheet: do not show ours on top of it.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // NotAllowedError and friends: fall through to the in-app sheet.
    }
  }

  useUiStore.getState().openDialog('share', data);
  return 'sheet';
}
