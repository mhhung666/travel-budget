// Base API client
export { api, ApiClient, ApiError } from './api';
export type { ApiResponse } from '@/types';

// Auth service
export { authService } from './auth.service';
export type {
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  UpdateProfileDto,
} from '@/types';

// Trip service
export { tripService } from './trip.service';
export type { Trip, TripWithMembers, CreateTripDto, UpdateTripDto } from '@/types';

// Expense service
export { expenseService } from './expense.service';
export type {
  Expense,
  ExpenseSplit,
  CreateExpenseDto,
  UpdateExpenseDto,
} from '@/types';

// Member service
export { memberService } from './member.service';
export type { Member } from '@/types';

// Settlement service
export { settlementService } from './settlement.service';
export type { UserBalance, Transfer, SettlementData } from '@/types';
