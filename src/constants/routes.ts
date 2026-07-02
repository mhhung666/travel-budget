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
  TRIP_CHECKLISTS: (id: string | number) => `/trips/${id}/checklists`,
  TRIP_STATS: (id: string | number) => `/trips/${id}/stats`,
  TRIP_ACTIVITY: (id: string | number) => `/trips/${id}/activity`,
  TRIP_SETTINGS: (id: string | number) => `/trips/${id}/settings`,
  SETTINGS: '/settings',

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
 * Routes that require authentication
 */
export const PROTECTED_ROUTES = ['/trips', '/map', '/wrapped', '/settings'];

/**
 * Routes that should redirect to /trips if already authenticated
 */
export const AUTH_ROUTES = ['/login'];
