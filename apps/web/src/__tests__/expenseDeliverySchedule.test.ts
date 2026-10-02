import { describe, expect, it } from 'vitest';
import vercel from '../../vercel.json';

describe('Hobby daily expense delivery schedule', () => {
  it('registers one daily recovery job without replacing the daily digest', () => {
    expect(vercel.crons.filter((job) => job.path === '/api/cron/expense-delivery')).toEqual([
      { path: '/api/cron/expense-delivery', schedule: '0 12 * * *' },
    ]);
    expect(vercel.crons).toContainEqual({
      path: '/api/cron/expense-digest',
      schedule: '0 13 * * *',
    });
  });

  it('keeps each configured cron at one fixed UTC time per day for Hobby', () => {
    for (const job of vercel.crons) {
      const fields = job.schedule.split(' ');
      expect(fields).toHaveLength(5);
      expect(fields.slice(2)).toEqual(['*', '*', '*']);
      expect(fields[0]).toMatch(/^(?:[0-9]|[1-5][0-9])$/);
      expect(fields[1]).toMatch(/^(?:[0-9]|1[0-9]|2[0-3])$/);
    }
  });
});
