import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import {
  loginInput,
  refreshInput,
  userSchema,
  sessionSchema,
  tripsSchema,
  landingSchema,
} from '../src/index.ts';

const schemas = Object.fromEntries(
  Object.entries({
    LoginInput: loginInput,
    RefreshInput: refreshInput,
    User: userSchema,
    Session: sessionSchema,
    Trips: tripsSchema,
    Landing: landingSchema,
    Logout: z.object({ loggedOut: z.literal(true) }),
    Error: z.object({ error: z.object({ code: z.string() }), requestId: z.string() }),
  }).map(([name, schema]) => {
    const { $schema, ...json } = z.toJSONSchema(schema);
    return [name, json];
  })
);
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const response = (name) => ({
  description: 'Success; Cache-Control: no-store',
  content: {
    'application/json': {
      schema: { type: 'object', required: ['data'], properties: { data: ref(name) } },
    },
  },
});
const operation = (id, output, input) => ({
  operationId: id,
  security: input ? [] : [{ bearerAuth: [] }],
  ...(input
    ? { requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } } }
    : {}),
  responses: {
    200: response(output),
    ...Object.fromEntries(
      [400, 401, 404, 413, 415, 429, 500].map((status) => [
        status,
        {
          description: 'Error code; 429 includes Retry-After seconds',
          content: { 'application/json': { schema: ref('Error') } },
        },
      ])
    ),
  },
});
const dateParam = {
  name: 'date',
  in: 'query',
  description: 'Device calendar date. Defaults to server UTC date if omitted.',
  schema: { type: 'string', format: 'date' },
};
const paths = {
  '/auth/login': { post: operation('login', 'Session', 'LoginInput') },
  '/auth/refresh': { post: operation('refresh', 'Session', 'RefreshInput') },
  '/auth/logout': { post: operation('logout', 'Logout', 'RefreshInput') },
  '/me': { get: operation('me', 'User') },
  '/trips': {
    get: {
      ...operation('trips', 'Trips'),
      parameters: [
        dateParam,
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 999999, default: 1 },
        },
      ],
      description:
        '20 items/page; ongoing, upcoming, unscheduled, past, archived. Pagination is not a snapshot; refresh from page 1 after changes.',
    },
  },
  '/trips/{id}/landing': {
    get: {
      ...operation('landing', 'Landing'),
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
        dateParam,
      ],
    },
  },
};
const output = new URL('../openapi.json', import.meta.url);
const generated =
  JSON.stringify(
    {
      openapi: '3.1.0',
      info: {
        title: 'Travel Budget mobile HTTP API',
        version: 'v1',
        description:
          'Contract version, independent of application version. Native client; no cross-origin browser access. Refresh rotation is single-use; replay revokes the device session. Absolute 30-day lifetime, 15-minute access token. Logout uses refreshToken. Dates are date-only; money is TWD rounded by existing services.',
      },
      servers: [{ url: '/api/v1' }],
      paths,
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
        schemas,
      },
    },
    null,
    2
  ) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== generated) {
    console.error('OpenAPI is stale. Run pnpm contracts:generate from the repository root.');
    process.exitCode = 1;
  }
} else {
  writeFileSync(output, generated);
}
