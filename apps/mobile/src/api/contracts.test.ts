import contract from '@travel-budget/contracts/openapi.json';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { userSchema, sessionSchema, tripsSchema, landingSchema } from './contracts';
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalize(child)])
    );
    if (Array.isArray(result.type)) {
      result.anyOf = result.type.map((type) => ({ type }));
      delete result.type;
    }
    return result;
  }
  return value;
}
describe('published backend contract', () => {
  for (const [name, schema] of Object.entries({
    User: userSchema,
    Session: sessionSchema,
    Trips: tripsSchema,
    Landing: landingSchema,
  })) {
    it(`keeps ${name} response fields in sync`, () => {
      const actual = z.toJSONSchema(schema);
      delete actual.$schema;
      const expected = normalize(
        contract.components.schemas[name as keyof typeof contract.components.schemas]
      );
      if (!expected || typeof expected !== 'object') throw new Error('Missing contract schema');
      expect(normalize(actual)).toMatchObject(expected);
    });
  }
});
