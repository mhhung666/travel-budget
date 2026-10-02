import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 從在地化地名表挑出當前語言的名字，缺值時退回 fallback（建立時存下的原字串）。
 */
export function pickLocalizedName(
  names: Record<string, string> | undefined,
  locale: string,
  fallback: string
): string {
  return names?.[locale] || fallback;
}
