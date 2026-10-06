import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import {
  loginInput,
  refreshInput,
  userSchema,
  sessionSchema,
  tripsSchema,
  landingSchema,
  expensesSchema,
  expenseDetailSchema,
  settlementSchema,
  expenseOptionsSchema,
  expensePreviewInput,
  expensePreviewSchema,
  expenseCreateInput,
  expenseRequestSchema,
  MAX_EXPENSE_AMOUNT,
  tripCreateInput,
  tripJoinInput,
  tripMutationResultSchema,
  invitationSchema,
  mutationRequestSchema,
} from '../src/index.ts';

const maxAmount = MAX_EXPENSE_AMOUNT.toLocaleString('en-US', { minimumFractionDigits: 2 });

const schemas = Object.fromEntries(
  Object.entries({
    TripCreateInput: tripCreateInput,
    TripJoinInput: tripJoinInput,
    TripMutationResult: tripMutationResultSchema,
    Invitation: invitationSchema,
    MutationRequest: mutationRequestSchema,
    LoginInput: loginInput,
    RefreshInput: refreshInput,
    User: userSchema,
    Session: sessionSchema,
    Trips: tripsSchema,
    Landing: landingSchema,
    Expenses: expensesSchema,
    ExpenseDetail: expenseDetailSchema,
    Settlement: settlementSchema,
    ExpenseOptions: expenseOptionsSchema,
    ExpensePreviewInput: expensePreviewInput,
    ExpensePreview: expensePreviewSchema,
    ExpenseCreateInput: expenseCreateInput,
    ExpenseRequest: expenseRequestSchema,
    Logout: z.object({ loggedOut: z.literal(true) }),
    Error: z.object({ error: z.object({ code: z.string() }), requestId: z.string() }),
  }).map(([name, schema]) => {
    const { $schema, ...json } = z.toJSONSchema(schema, {
      io: ['TripCreateInput', 'TripJoinInput'].includes(name) ? 'input' : 'output',
    });
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
// Bodies of the sign-in routes are unauthenticated; authenticated writes opt in explicitly.
const operation = (id, output, input, { authenticated = !input, errors = [] } = {}) => ({
  operationId: id,
  security: authenticated ? [{ bearerAuth: [] }] : [],
  ...(input
    ? { requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } } }
    : {}),
  responses: {
    200: response(output),
    ...Object.fromEntries(
      [400, 401, 404, ...errors, 413, 415, 429, 500]
        .sort((a, b) => a - b)
        .map((status) => [
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
const objectId = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' };
const tripIdParam = { name: 'id', in: 'path', required: true, schema: objectId };
const paths = {
  '/auth/login': { post: operation('login', 'Session', 'LoginInput') },
  '/auth/refresh': { post: operation('refresh', 'Session', 'RefreshInput') },
  '/auth/logout': { post: operation('logout', 'Logout', 'RefreshInput') },
  '/me': { get: operation('me', 'User') },
  '/trips/join': {
    post: operation('joinTrip', 'TripMutationResult', 'TripJoinInput', {
      authenticated: true,
      errors: [409],
    }),
  },
  '/mutation-requests/{clientRequestId}': {
    get: {
      ...operation('mutationRequest', 'MutationRequest'),
      parameters: [
        {
          name: 'clientRequestId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
    },
  },
  '/trips/{id}/invitation': {
    get: { ...operation('invitation', 'Invitation'), parameters: [tripIdParam] },
  },
  '/trips': {
    post: operation('createTrip', 'TripMutationResult', 'TripCreateInput', {
      authenticated: true,
      errors: [409],
    }),
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
      parameters: [tripIdParam, dateParam],
    },
  },
  '/trips/{id}/expenses': {
    get: {
      ...operation('expenses', 'Expenses'),
      parameters: [
        tripIdParam,
        {
          name: 'cursor',
          in: 'query',
          description: 'Opaque nextCursor from the previous page; an invalid cursor returns 400.',
          schema: { type: 'string', minLength: 1, maxLength: 64 },
        },
      ],
      description:
        '20 items/page ordered by date, createdAt and id (all descending). Pagination is not a snapshot; refresh from the first page after changes. Members only: non-members and unknown trips return 404. Attachments are never returned.',
    },
    post: {
      ...operation('createExpense', 'ExpenseDetail', 'ExpenseCreateInput', {
        authenticated: true,
        errors: [409],
      }),
      parameters: [tripIdParam],
      description: `Creates one TWD expense (rate 1) split among trip members. original_amount and every share_amount have at most two decimals and are at most ${maxAmount}; anything larger returns 400 and writes nothing. client_request_id is a UUID the client generates once per confirmed submission and reuses for every retry of the same payload (letter case does not matter); the first success and every replay return 200 with the same body, and replays are authorized again. A 4xx status means this request wrote nothing (409: the key was already used with different content). A 5xx status, timeout or dropped connection leaves the outcome unknown: query /expense-requests/{clientRequestId} or retry the identical payload. 429 means the trip write could not start; nothing was written, retry with the same key after Retry-After. Unknown fields are rejected; an expense deleted after creation is not created again by a replay.`,
    },
  },
  '/trips/{id}/expenses/preview': {
    post: {
      ...operation('previewExpense', 'ExpensePreview', 'ExpensePreviewInput', {
        authenticated: true,
      }),
      parameters: [tripIdParam],
      description: `Equal split of a TWD amount (two decimals, at most ${maxAmount}) among the selected members, returned in expense-options order (the earliest joined member among them receives the leftover cent) whatever order the request used. Read-only: nothing is stored or reserved, and creating the expense validates everything again.`,
    },
  },
  '/trips/{id}/expense-options': {
    get: {
      ...operation('expenseOptions', 'ExpenseOptions'),
      parameters: [tripIdParam],
      description:
        'Trip members (earliest joined first, virtual members included; ids and display names only) and the expense categories. Members only.',
    },
  },
  '/trips/{id}/expense-requests/{clientRequestId}': {
    get: {
      ...operation('expenseRequest', 'ExpenseRequest'),
      parameters: [
        tripIdParam,
        {
          name: 'clientRequestId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      description:
        "Result of the caller's own earlier create request for this trip; the key matches without regard to letter case. committed: the expense as accepted, also after it was deleted later. not_found: no result is stored for this key; it does not prove that a request with the same key is not still running, so retry with the original key and payload.",
    },
  },
  '/trips/{id}/expenses/{expenseId}': {
    get: {
      ...operation('expense', 'ExpenseDetail'),
      parameters: [
        tripIdParam,
        { name: 'expenseId', in: 'path', required: true, schema: objectId },
      ],
      description:
        'Amounts are TWD rounded by the existing money rules; originalAmount, currency and exchangeRate describe the entered value. An expense of another trip returns 404.',
    },
  },
  '/trips/{id}/settlement': {
    get: {
      ...operation('settlement', 'Settlement'),
      parameters: [tripIdParam],
      description:
        'Balances already include registered payments. suggestedTransfers are suggestions only and have not been paid. status distinguishes no expenses, settled and outstanding.',
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
