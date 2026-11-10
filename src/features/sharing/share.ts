import { useUiStore } from '@/store/uiStore';
import type { SharePayload } from '@/store/types';

export type ShareOutcome = 'native' | 'sheet' | 'cancelled';

/**
 * Share through the OS sheet when available (ARCHITECTURE §9), otherwise open the in-app
 * ShareSheet. Must be called from a user gesture (click or keydown).
 */
export async function share(payload: SharePayload): Promise<ShareOutcome> {
  const data: SharePayload = { title: payload.title, url: payload.url, text: payload.text ?? payload.title };
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
