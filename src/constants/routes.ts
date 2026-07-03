/**
 * Application route constants
 * Use these instead of hardcoding route strings
 */
export const ROUTES = {
  // Public routes
  HOME: '/',
  LOGIN: '/login',

  // Protected routes
  TRIPS: '/trips',
  MAP: '/map',
  STATS: '/stats',
  WRAPPED: '/wrapped',
  // 旅行地圖公開分享頁（去識別化、唯讀，不需登入）
  MAP_SHARE: (code: string) => `/map/share/${code}`,
  // 年度回顧公開分享頁（去識別化、唯讀，不需登入）
  WRAPPED_SHARE: (code: string, year: string | number) => `/wrapped/share/${code}/${year}`,
  TRIP_DETAIL: (id: string | number) => `/trips/${id}`,
  TRIP_SETTLEMENT: (id: string | number) => `/trips/${id}/settlement`,
  TRIP_ITINERARY: (id: string | number) => `/trips/${id}/itinerary`,
  TRIP_NOTES: (id: string | number) => `/trips/${id}/notes`,
  TRIP_CHECKLISTS: (id: string | number) => `/trips/${id}/checklists`,
  TRIP_STATS: (id: string | number) => `/trips/${id}/stats`,
  TRIP_ACTIVITY: (id: string | number) => `/trips/${id}/activity`,
  TRIP_SETTINGS: (id: string | number) => `/trips/${id}/settings`,
  SETTINGS: '/settings',
  // 「我的」子頁（settings 由單頁拆成列表選單＋子頁，UI/UX 重設計 5.5）
  SETTINGS_ACCOUNT: '/settings/account',
  SETTINGS_SECURITY: '/settings/security',
  SETTINGS_NOTIFICATIONS: '/settings/notifications',
  SETTINGS_APPEARANCE: '/settings/appearance',
  // PWA「記一筆」捷徑：導向最近行程並開啟新增支出（manifest shortcut 用）
  QUICK_ADD: '/quick-add',

  // Join route
  JOIN: (hashCode: string) => `/join/${hashCode}`,

  // API routes
  API: {
    AUTH: {
      LOGIN: '/api/auth/login',
      LOGOUT: '/api/auth/logout',
      REGISTER: '/api/auth/register',
      ME: '/api/auth/me',
      UPDATE: '/api/auth/update',
    },
    TRIPS: '/api/trips',
    TRIP: (id: string | number) => `/api/trips/${id}`,
    TRIP_EXPENSES: (id: string | number) => `/api/trips/${id}/expenses`,
    TRIP_EXPENSE: (tripId: string | number, expenseId: number) =>
      `/api/trips/${tripId}/expenses/${expenseId}`,
    TRIP_MEMBERS: (id: string | number) => `/api/trips/${id}/members`,
    TRIP_MEMBER: (tripId: string | number, userId: number) =>
      `/api/trips/${tripId}/members/${userId}`,
    TRIP_SETTLEMENT: (id: string | number) => `/api/trips/${id}/settlement`,
    JOIN_TRIP: '/api/trips/join',
    // 公開（不需登入）旅行地圖分享資料
    PUBLIC_MAP: (code: string) => `/api/public/map/${code}`,
    // 公開（不需登入）年度回顧分享資料（去識別化、僅地理 + 年份）
    PUBLIC_WRAPPED: (code: string, year: string | number) => `/api/public/wrapped/${code}/${year}`,
  },
} as const;

/**
 * 需要登入的路由。proxy.ts 以「完整路徑精確相符」比對，故只保護頁面本身：
 * 例如 '/wrapped' 保護回顧頁，但 '/wrapped/share/[code]/[year]' 因多路徑段不相符而維持公開
 * （'/map' vs '/map/share' 同理）。'/map' 本頁刻意不列入——未登入可直開，由頁面自行處理未登入狀態。
 * 此清單為單一來源，由 proxy.ts 直接引用。
 */
export const PROTECTED_ROUTES = [
  '/trips',
  '/settings',
  '/settings/account',
  '/settings/security',
  '/settings/notifications',
  '/settings/appearance',
  '/stats',
  '/wrapped',
  '/quick-add',
];

/**
 * 已登入用戶不應訪問的路由（如登入頁）→ 導向 /trips。proxy.ts 引用。
 */
export const AUTH_ROUTES = ['/login'];
