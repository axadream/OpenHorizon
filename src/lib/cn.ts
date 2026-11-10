import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge does not know the OpenHorizon custom utilities; register them so
// conflicts resolve correctly (e.g. `text-md` is a font size, not a colour).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['md'] }],
      shadow: [{ shadow: ['1', '2', '3', 'accent'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
