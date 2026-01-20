import { describe, it, expect } from 'vitest';

describe('Sample Test Suite', () => {
  it('should pass a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string operations', () => {
    const greeting = 'Hello, Travel Budget!';
    expect(greeting).toContain('Travel Budget');
  });

  it('should work with arrays', () => {
    const currencies = ['TWD', 'JPY', 'USD', 'EUR', 'HKD'];
    expect(currencies).toHaveLength(5);
    expect(currencies).toContain('TWD');
  });

  it('should work with objects', () => {
    const expense = {
      amount: 100,
      currency: 'TWD',
      description: 'Lunch',
    };
    expect(expense).toHaveProperty('amount', 100);
    expect(expense.currency).toBe('TWD');
  });
});
