// Base API client
export { api, ApiClient, ApiError } from './api';
export type { ApiResponse } from './api';

// Auth service
export { authService } from './auth.service';
export type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  UpdateProfileRequest,
} from './auth.service';

// Trip service
export { tripService } from './trip.service';
export type {
  Trip,
  TripWithMembers,
  CreateTripRequest,
  UpdateTripRequest,
} from './trip.service';

// Expense service
export { expenseService } from './expense.service';
export type {
  Expense,
  ExpenseSplit,
  CreateExpenseRequest,
  UpdateExpenseRequest,
} from './expense.service';

// Member service
export { memberService } from './member.service';
export type { Member } from './member.service';

// Settlement service
export { settlementService } from './settlement.service';
export type { UserBalance, Transfer, SettlementData } from './settlement.service';
