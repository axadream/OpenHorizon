import { useRef, type CSSProperties, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Chip } from '@/components/ui/Chip';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Visual put before the label (for example a theme preview swatch). */
  leading?: ReactNode;
  /** Applied to the chip itself, for example a font-family so the label is shown in that font. */
  style?: CSSProperties;
}

/** Chip radiogroup with arrow-key navigation (only the selected chip is in the tab order). */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange(value: T): void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number): void => {
    const next = (from + delta + options.length) % options.length;
    const opt = options[next];
    if (!opt) return;
    onChange(opt.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-2"
      onKeyDown={(e) => {
        const idx = options.findIndex((o) => o.value === value);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(idx, 1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(idx, -1);
        }
      }}
    >
      {options.map((o, i) => {
        const Icon = o.icon;
        return (
          <Chip
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            selected={o.value === value}
            style={o.style}
            onClick={() => onChange(o.value)}
          >
            {o.leading}
            {Icon ? <Icon aria-hidden="true" size={14} strokeWidth={1.75} /> : null}
            {o.label}
          </Chip>
        );
      })}
    </div>
  );
}
