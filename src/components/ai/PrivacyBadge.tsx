import { Cloud, Cpu, Server, type LucideIcon } from 'lucide-react';
import type { AiPrivacy } from '@/features/ai/types';
import { t, useT } from '@/i18n/i18n';
import { cn } from '@/lib/cn';
import { PRIVACY_KEY } from './labels';

const ICON: Record<AiPrivacy, LucideIcon> = { 'on-device': Cpu, local: Server, cloud: Cloud };

const TONE: Record<AiPrivacy, string> = {
  'on-device': 'bg-success-soft text-success',
  local: 'bg-accent-soft text-accent',
  cloud: 'bg-warning-soft text-warning',
};

/** Where the text is processed: On-device (green), Local (cyan) or Cloud (amber). Text label, not colour alone. */
export function PrivacyBadge({ privacy, className }: { privacy: AiPrivacy; className?: string }) {
  useT();
  const Icon = ICON[privacy];
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium',
        TONE[privacy],
        className,
      )}
    >
      <Icon aria-hidden="true" size={12} strokeWidth={1.75} />
      {t(PRIVACY_KEY[privacy])}
    </span>
  );
}
