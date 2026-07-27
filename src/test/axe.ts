import axe, { type ElementContext, type RunOptions } from 'axe-core';
import { expect } from 'vitest';

const SERIOUS_IMPACTS = new Set(['serious', 'critical']);

/**
 * Runs axe in jsdom and fails only on serious/critical violations.
 * Color contrast and real-device semantics still require browser/manual checks.
 */
export async function expectNoSeriousAxeViolations(context: ElementContext, options?: RunOptions) {
  const result = await axe.run(context, {
    ...options,
    rules: {
      // jsdom has no canvas/layout engine; contrast remains a browser/manual check.
      'color-contrast': { enabled: false },
      ...options?.rules,
    },
  });
  const violations = result.violations.filter(
    (violation) => violation.impact && SERIOUS_IMPACTS.has(violation.impact)
  );

  expect(
    violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target),
    }))
  ).toEqual([]);
}
