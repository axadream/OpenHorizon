import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Check, Copy, Link as LinkIcon, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { copyShareText } from '@/features/sharing/share';
import { copyToClipboard, SHARE_TARGETS, shareTargetHref, type ShareTargetId } from '@/features/sharing/shareTargets';
import { useT } from '@/i18n/i18n';
import { useShareTarget } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { toast } from '@/lib/toast';
import type { SharePayload } from '@/store/types';
import {
  FacebookBrandIcon,
  LinkedInBrandIcon,
  RedditBrandIcon,
  TelegramBrandIcon,
  WhatsAppBrandIcon,
  XBrandIcon,
  type BrandIconProps,
} from './brandIcons';

/**
 * Fallback share modal (DESIGN §6.11). Self-contained: it reads the `share` dialog slot and
 * closes it. Mounted once by AppShell.
 */

const BRAND_ICONS: Record<Exclude<ShareTargetId, 'email'>, ComponentType<BrandIconProps>> = {
  x: XBrandIcon,
  whatsapp: WhatsAppBrandIcon,
  telegram: TelegramBrandIcon,
  reddit: RedditBrandIcon,
  linkedin: LinkedInBrandIcon,
  facebook: FacebookBrandIcon,
};

const TILE_ICON_CLASS = 'steel flex size-12 items-center justify-center rounded-full text-text';
const TILE_LINK_CLASS =
  'group flex min-w-0 flex-col items-center gap-1.5 rounded-sm focus-ring transition-[transform] duration-[var(--duration-fast)] ease-standard active:scale-[0.97]';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function ShareBody({ payload }: { payload: SharePayload }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  async function copy(text: string): Promise<void> {
    const ok = await copyToClipboard(text);
    if (!ok) {
      toast.error(t('share.copyFailed'));
      return;
    }
    setCopied(true);
    toast.success(t('share.linkCopied'));
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="steel-card rounded-md p-3">
        <p className="line-clamp-2 font-medium text-text">{payload.title}</p>
        <p className="mt-0.5 truncate text-xs text-text-muted">{hostOf(payload.url)}</p>
      </div>

      <ul role="list" className="grid grid-cols-4 gap-3 md:grid-cols-7">
        {SHARE_TARGETS.map((target) => {
          const isEmail = target.id === 'email';
          const Icon = target.id === 'email' ? null : BRAND_ICONS[target.id];
          return (
            <li key={target.id} className="flex justify-center">
              <a
                href={shareTargetHref(target.id, payload)}
                target={isEmail ? undefined : '_blank'}
                rel={isEmail ? undefined : 'noopener noreferrer'}
                aria-label={isEmail ? t('share.byEmail') : t('share.on', { target: target.label })}
                className={TILE_LINK_CLASS}
              >
                <span className={TILE_ICON_CLASS}>
                  {Icon ? <Icon size={20} /> : <Mail aria-hidden="true" size={20} strokeWidth={1.75} />}
                </span>
                <span className="text-xs text-text-muted">{target.label}</span>
              </a>
            </li>
          );
        })}
        <li className="flex justify-center">
          <button type="button" onClick={() => void copy(copyShareText(payload))} className={TILE_LINK_CLASS}>
            <span className={TILE_ICON_CLASS}>
              {copied ? (
                <Check aria-hidden="true" size={20} strokeWidth={1.75} />
              ) : (
                <LinkIcon aria-hidden="true" size={20} strokeWidth={1.75} />
              )}
            </span>
            <span className="text-xs text-text-muted">
              {copied ? t('share.copied') : t('share.copyLink')}
            </span>
          </button>
        </li>
      </ul>

      <div className="flex items-center gap-2">
        <label htmlFor="share-url" className="sr-only">
          {t('share.linkLabel')}
        </label>
        <input
          id="share-url"
          readOnly
          value={payload.url}
          onFocus={(e) => e.currentTarget.select()}
          className="well h-9 min-w-0 flex-1 rounded-sm border border-border-strong bg-bg px-3 text-base text-text focus-ring"
        />
        <Button
          variant="steel"
          size="sm"
          leadingIcon={copied ? Check : Copy}
          onClick={() => void copy(payload.url)}
        >
          {copied ? t('share.copied') : t('share.copy')}
        </Button>
      </div>
    </div>
  );
}

export function ShareSheet() {
  const t = useT();
  const payload = useShareTarget();
  return (
    <Dialog
      open={payload !== null}
      onOpenChange={(open) => {
        if (!open) useUiStore.getState().closeDialog('share');
      }}
      title={t('share.title')}
    >
      {payload ? <ShareBody payload={payload} /> : null}
    </Dialog>
  );
}
