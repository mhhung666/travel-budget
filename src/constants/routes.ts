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
  TRIP_DETAIL: (id: string | number) => `/trips/${id}`,
  TRIP_SETTLEMENT: (id: string | number) => `/trips/${id}/settlement`,
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
  },
} as const;

/**
 * Routes that require authentication
 */
export const PROTECTED_ROUTES = ['/trips', '/settings'];

/**
 * Routes that should redirect to /trips if already authenticated
 */
export const AUTH_ROUTES = ['/login'];
