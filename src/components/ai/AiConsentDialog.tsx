import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { t, useT } from '@/i18n/i18n';

export type AiConsentScope = 'article' | 'test' | 'models';

export interface AiConsentDialogProps {
  open: boolean;
  /** Host the request would go to, shown in the title and the list. */
  host: string;
  /** 'article': the article fields are sent. 'test' and 'models': only the short test prompt or the key. */
  scope: AiConsentScope;
  /** Whether the API key is part of the request (listed when true). */
  withKey: boolean;
  onAccept(): void;
  onDecline(): void;
}

/**
 * Explicit consent before the first request to a cloud provider. Lists exactly what is sent and to
 * which host. Declining (or Escape) sends nothing.
 */
export function AiConsentDialog({ open, host, scope, withKey, onAccept, onDecline }: AiConsentDialogProps) {
  useT();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDecline();
      }}
      title={t('ai.consent.title', { host })}
      footer={
        <>
          <Button variant="ghost" onClick={onDecline}>
            {t('ai.consent.decline')}
          </Button>
          <Button variant="primary" onClick={onAccept}>
            {t('ai.consent.accept')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-silver">
        <p>{t('ai.consent.intro')}</p>
        <ul className="flex list-disc flex-col gap-1.5 ps-5">
          {scope === 'article' ? (
            <>
              <li>{t('ai.consent.itemTitle')}</li>
              <li>{t('ai.consent.itemUrl')}</li>
              <li>{t('ai.consent.itemText')}</li>
              <li>{t('ai.consent.itemInstructions')}</li>
              {withKey ? <li>{t('ai.consent.itemKey')}</li> : null}
            </>
          ) : (
            <li>{scope === 'test' ? t('ai.consent.scopeTest') : t('ai.consent.scopeModels')}</li>
          )}
        </ul>
        <p className="text-xs text-text-muted">{t('ai.consent.note')}</p>
      </div>
    </Dialog>
  );
}
