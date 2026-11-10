import { createContext, forwardRef, useContext, useImperativeHandle, useRef, type ComponentPropsWithoutRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Popover, type PopoverProps } from '@/components/ui/Popover';
import { useRovingFocus } from '@/hooks/useRovingFocus';

const ITEM = '[role="menuitem"]';
const ENABLED_ITEM = '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])';

interface MenuContextValue {
  close(): void;
}

const MenuContext = createContext<MenuContextValue>({ close: () => {} });

export interface MenuProps extends Omit<PopoverProps, 'role' | 'initialFocusSelector'> {}

/**
 * role="menu" popup. Arrow keys / Home / End move between items (roving tabindex),
 * Escape closes (from Popover). Selecting an item closes the menu unless its
 * onClick calls preventDefault().
 */
export const Menu = forwardRef<HTMLDivElement, MenuProps>(function Menu(
  { onOpenChange, className, ...rest },
  ref,
) {
  const menuRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => menuRef.current as HTMLDivElement);
  useRovingFocus(menuRef, ITEM, { orientation: 'vertical', loop: true });

  const close = () => onOpenChange(false);

  return (
    <MenuContext.Provider value={{ close }}>
      <Popover
        {...rest}
        onOpenChange={onOpenChange}
        ref={menuRef}
        role="menu"
        initialFocusSelector={ENABLED_ITEM}
        className={cn('min-w-[200px] p-1.5', className)}
      />
    </MenuContext.Provider>
  );
});

export interface MenuItemProps extends ComponentPropsWithoutRef<'button'> {
  icon?: LucideIcon;
  destructive?: boolean;
  /** Optional right-aligned hint, e.g. a keyboard shortcut. */
  hint?: string;
}

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { icon: Icon, destructive = false, hint, className, children, onClick, type = 'button', ...rest },
  ref,
) {
  const { close } = useContext(MenuContext);
  return (
    <button
      ref={ref}
      type={type}
      role="menuitem"
      tabIndex={-1}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) close();
      }}
      className={cn(
        'focus-ring flex h-9 w-full items-center gap-2.5 rounded-sm px-3 text-left text-base select-none',
        'transition-colors duration-[var(--duration-instant)] ease-standard',
        'hover:bg-card focus:bg-card disabled:opacity-50 disabled:pointer-events-none',
        destructive ? 'text-danger' : 'text-silver hover:text-text',
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0 opacity-80" /> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="ml-3 text-xs text-text-muted">{hint}</span> : null}
    </button>
  );
});
