import { describe, it, expect } from 'vitest';
import {
  createTripSchema,
  createExpenseSchema,
  updateExpenseSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  addVirtualMemberSchema,
  createItineraryDaySchema,
} from '@/lib/validation';

describe('createTripSchema', () => {
  it('should accept valid trip data', () => {
    const result = createTripSchema.safeParse({
      name: 'Tokyo Trip',
      description: 'A fun trip',
      start_date: '2024-03-01',
      end_date: '2024-03-10',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty name', () => {
    const result = createTripSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('should accept trip without dates', () => {
    const result = createTripSchema.safeParse({ name: 'Quick Trip' });
    expect(result.success).toBe(true);
  });

  it('should reject end_date before start_date', () => {
    const result = createTripSchema.safeParse({
      name: 'Trip',
      start_date: '2024-03-10',
      end_date: '2024-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('should accept same start and end date', () => {
    const result = createTripSchema.safeParse({
      name: 'Day Trip',
      start_date: '2024-03-01',
      end_date: '2024-03-01',
    });
    expect(result.success).toBe(true);
  });

  it('should trim whitespace from name', () => {
    const result = createTripSchema.safeParse({ name: '  Tokyo Trip  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Tokyo Trip');
    }
  });
});

describe('createExpenseSchema', () => {
  const validExpense = {
    payer_id: '507f1f77bcf86cd799439011',
    original_amount: 100,
    currency: 'TWD',
    exchange_rate: 1.0,
    description: 'Lunch',
    category: 'food',
    date: '2024-03-01',
    splits: [
      { user_id: '507f1f77bcf86cd799439011', share_amount: 50 },
      { user_id: '507f1f77bcf86cd799439012', share_amount: 50 },
    ],
  };

  it('should accept valid expense', () => {
    const result = createExpenseSchema.safeParse(validExpense);
    expect(result.success).toBe(true);
  });

  it('should reject zero amount', () => {
    const result = createExpenseSchema.safeParse({
      ...validExpense,
      original_amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative amount', () => {
    const result = createExpenseSchema.safeParse({
      ...validExpense,
      original_amount: -50,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty description', () => {
    const result = createExpenseSchema.safeParse({
      ...validExpense,
      description: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid date format', () => {
    const result = createExpenseSchema.safeParse({
      ...validExpense,
      date: '03/01/2024',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty splits', () => {
    const result = createExpenseSchema.safeParse({
      ...validExpense,
      splits: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid currency', () => {
    const result = createExpenseSchema.safeParse({
      ...validExpense,
      currency: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('should accept all valid currencies', () => {
    for (const currency of ['TWD', 'JPY', 'USD', 'EUR', 'HKD', 'THB']) {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        currency,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept all valid categories', () => {
    const categories = ['accommodation', 'transportation', 'food', 'shopping', 'entertainment', 'tickets', 'other'];
    for (const category of categories) {
      const result = createExpenseSchema.safeParse({
        ...validExpense,
        category,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('updateExpenseSchema', () => {
  it('should accept partial updates', () => {
    const result = updateExpenseSchema.safeParse({
      description: 'Updated lunch',
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty object (no updates)', () => {
    const result = updateExpenseSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('should accept valid credentials', () => {
    const result = loginSchema.safeParse({
      username: 'testuser',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty username', () => {
    const result = loginSchema.safeParse({
      username: '',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty password', () => {
    const result = loginSchema.safeParse({
      username: 'testuser',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('should accept valid registration', () => {
    const result = registerSchema.safeParse({
      username: 'newuser',
      display_name: 'New User',
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject short username (< 3 chars)', () => {
    const result = registerSchema.safeParse({
      username: 'ab',
      display_name: 'User',
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short password (< 6 chars)', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      display_name: 'User',
      email: 'test@example.com',
      password: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid email', () => {
    const result = registerSchema.safeParse({
      username: 'testuser',
      display_name: 'User',
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('should accept valid reset data', () => {
    const result = resetPasswordSchema.safeParse({
      username: 'testuser',
      email: 'test@example.com',
      new_password: 'newpassword123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject short new password', () => {
    const result = resetPasswordSchema.safeParse({
      username: 'testuser',
      email: 'test@example.com',
      new_password: '12345',
    });
    expect(result.success).toBe(false);
  });
});

describe('addVirtualMemberSchema', () => {
  it('should accept valid name', () => {
    const result = addVirtualMemberSchema.safeParse({ display_name: 'Guest User' });
    expect(result.success).toBe(true);
  });

  it('should reject empty name', () => {
    const result = addVirtualMemberSchema.safeParse({ display_name: '' });
    expect(result.success).toBe(false);
  });

  it('should trim whitespace', () => {
    const result = addVirtualMemberSchema.safeParse({ display_name: '  Guest  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display_name).toBe('Guest');
    }
  });
});

describe('createItineraryDaySchema', () => {
  it('should accept valid day data', () => {
    const result = createItineraryDaySchema.safeParse({
      title: 'Day 1 - Arrival',
      content: 'Arrive at airport',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty title', () => {
    const result = createItineraryDaySchema.safeParse({ title: '', content: '' });
    expect(result.success).toBe(false);
  });

  it('should default content to empty string', () => {
    const result = createItineraryDaySchema.safeParse({ title: 'Day 1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('');
    }
  });
});
