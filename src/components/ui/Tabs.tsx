import { createContext, forwardRef, useContext, useId, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useRovingFocus } from '@/hooks/useRovingFocus';

interface TabsContextValue {
  value: string;
  onValueChange(value: string): void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tab, TabList and TabPanel must be used inside <Tabs>');
  return ctx;
}

export interface TabsProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  value: string;
  onValueChange(value: string): void;
  children?: ReactNode;
}

/** WAI-ARIA tabs root. Controlled by `value`. */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { value, onValueChange, className, children, ...rest },
  ref,
) {
  const baseId = useId();
  return (
    <TabsContext.Provider value={{ value, onValueChange, baseId }}>
      <div ref={ref} className={cn('flex flex-col', className)} {...rest}>
        {children}
      </div>
    </TabsContext.Provider>
  );
});

export interface TabListProps extends ComponentPropsWithoutRef<'div'> {
  /** Accessible name for the tablist. */
  label: string;
}

/** Underline tab strip on the steel surface. Arrow keys / Home / End move focus; focus selects. */
export const TabList = forwardRef<HTMLDivElement, TabListProps>(function TabList(
  { label, className, ...rest },
  ref,
) {
  const innerRef = useRef<HTMLDivElement>(null);
  useRovingFocus(innerRef, '[role="tab"]', { orientation: 'horizontal' });
  return (
    <div
      ref={(el) => {
        innerRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      role="tablist"
      aria-label={label}
      className={cn('steel flex items-end gap-1 overflow-x-auto px-2 hairline-b', className)}
      {...rest}
    />
  );
});

export interface TabProps extends Omit<ComponentPropsWithoutRef<'button'>, 'value'> {
  value: string;
  icon?: LucideIcon;
}

export const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab(
  { value, icon: Icon, className, children, onFocus, onClick, type = 'button', ...rest },
  ref,
) {
  const { value: selected, onValueChange, baseId } = useTabs();
  const isSelected = selected === value;
  return (
    <button
      ref={ref}
      type={type}
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={isSelected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={isSelected ? 0 : -1}
      onClick={(e) => {
        onClick?.(e);
        onValueChange(value);
      }}
      onFocus={(e) => {
        onFocus?.(e);
        onValueChange(value);
      }}
      className={cn(
        'focus-ring relative inline-flex h-10 shrink-0 items-center gap-2 px-3 text-base font-medium select-none',
        'transition-colors duration-[var(--duration-instant)] ease-standard',
        isSelected
          ? 'text-text after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent'
          : 'text-text-muted hover:text-silver',
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon aria-hidden="true" size={16} strokeWidth={1.75} /> : null}
      {children}
    </button>
  );
});

export interface TabPanelProps extends ComponentPropsWithoutRef<'div'> {
  value: string;
}

export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(function TabPanel(
  { value, className, children, ...rest },
  ref,
) {
  const { value: selected, baseId } = useTabs();
  const isSelected = selected === value;
  return (
    <div
      ref={ref}
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      hidden={!isSelected}
      className={cn('min-h-0 flex-1 outline-none', className)}
      {...rest}
    >
      {isSelected ? children : null}
    </div>
  );
});
