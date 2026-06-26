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
  // 旅行地圖公開分享頁（去識別化、唯讀，不需登入）
  MAP_SHARE: (code: string) => `/map/share/${code}`,
  TRIP_DETAIL: (id: string | number) => `/trips/${id}`,
  TRIP_SETTLEMENT: (id: string | number) => `/trips/${id}/settlement`,
  TRIP_ITINERARY: (id: string | number) => `/trips/${id}/itinerary`,
  TRIP_CHECKLISTS: (id: string | number) => `/trips/${id}/checklists`,
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
  },
} as const;

/**
 * Routes that require authentication
 */
export const PROTECTED_ROUTES = ['/trips', '/map', '/settings'];

/**
 * Routes that should redirect to /trips if already authenticated
 */
export const AUTH_ROUTES = ['/login'];
