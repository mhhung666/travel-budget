import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCorrectionTiming, trackProductEvent } from '@/lib/productEvents';

const { track } = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@vercel/analytics', () => ({ track }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('privacy-safe product events', () => {
  it('emits only the typed categorical payload', () => {
    trackProductEvent('quick_add_flow', {
      stage: 'form_opened',
      path: 'direct',
    });

    expect(track).toHaveBeenCalledWith('quick_add_flow', {
      stage: 'form_opened',
      path: 'direct',
    });
  });

  it('records insight behavior without expense content or identifiers', () => {
    trackProductEvent('stats_insight_action', {
      ruleVersion: 'v1',
      insightType: 'single_expense_concentration',
      action: 'view_details',
    });

    expect(track).toHaveBeenCalledWith('stats_insight_action', {
      ruleVersion: 'v1',
      insightType: 'single_expense_concentration',
      action: 'view_details',
    });
  });

  it('never interrupts the product flow when analytics is unavailable', () => {
    track.mockImplementationOnce(() => {
      throw new Error('analytics unavailable');
    });

    expect(() =>
      trackProductEvent('activation_step', {
        step: 'trip_created',
      })
    ).not.toThrow();
  });

  it('buckets corrections without emitting an exact timestamp', () => {
    const now = new Date('2026-07-27T12:00:00.000Z');

    expect(getCorrectionTiming('2026-07-27T11:59:00.000Z', now)).toBe('within_2_minutes');
    expect(getCorrectionTiming('2026-07-27T11:50:00.000Z', now)).toBe('later');
    expect(getCorrectionTiming('2026-07-27T12:01:00.000Z', now)).toBe('unknown');
    expect(getCorrectionTiming('invalid', now)).toBe('unknown');
  });

  it('keeps sensitive field names out of the event schema', () => {
    const sourceText = readFileSync(join(process.cwd(), 'src', 'lib', 'productEvents.ts'), 'utf8');
    const source = ts.createSourceFile(
      'productEvents.ts',
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const names = new Set<string>();

    const visit = (node: ts.Node) => {
      if (ts.isPropertySignature(node) && node.name) names.add(node.name.getText(source));
      ts.forEachChild(node, visit);
    };
    visit(source);

    expect([...names]).not.toEqual(
      expect.arrayContaining([
        'tripId',
        'userId',
        'hashCode',
        'name',
        'description',
        'amount',
        'date',
      ])
    );
  });
});
