export interface Category {
  code: string;
  icon: string;
  nameKey: string; // i18n key for the category name
}

/**
 * Expense categories with i18n keys for names
 */
export const CATEGORIES: Category[] = [
  { code: 'accommodation', icon: '🏨', nameKey: 'category.accommodation' },
  { code: 'transportation', icon: '🚗', nameKey: 'category.transportation' },
  { code: 'food', icon: '🍽️', nameKey: 'category.food' },
  { code: 'shopping', icon: '🛍️', nameKey: 'category.shopping' },
  { code: 'entertainment', icon: '🎭', nameKey: 'category.entertainment' },
  { code: 'tickets', icon: '🎫', nameKey: 'category.tickets' },
  { code: 'other', icon: '📦', nameKey: 'category.other' },
] as const;

/**
 * Valid category codes for validation
 */
export const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

/**
 * Default category
 */
export const DEFAULT_CATEGORY = 'other';

/**
 * Get category by code
 */
export function getCategory(code: string): Category | undefined {
  return CATEGORIES.find((c) => c.code === code);
}

/**
 * Get category icon by code
 */
export function getCategoryIcon(code: string): string {
  return getCategory(code)?.icon ?? '📦';
}
