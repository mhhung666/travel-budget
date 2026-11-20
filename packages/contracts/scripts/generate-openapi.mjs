import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import {
  v2Schemas,
  loginInput,
  emailChangeRequestInput,
  emailChangeConfirmInput,
  emailChangeCancelInput,
  emailChangeSentSchema,
  emailChangeResultSchema,
  emailChangeCancelledSchema,
  passwordChangeInput,
  passwordChangeResultSchema,
  registerInput,
  passwordResetRequestInput,
  passwordResetInput,
  passwordResetAcceptedSchema,
  passwordResetResultSchema,
  refreshInput,
  userSchema,
  accountProfileSchema,
  accountProfileInput,
  notificationPreferencesSchema,
  notificationPreferencesInput,
  friendsSchema,
  friendInviteInput,
  friendCommandInput,
  friendMutationSchema,
  avatarContextSchema,
  avatarWriteInput,
  avatarWriteStateSchema,
  avatarUploadTicketSchema,
  avatarWriteCommandInput,
  sessionSchema,
  logoutResultSchema,
  tripsSchema,
  tripListQuerySchema,
  tripListMetadataSchema,
  landingSchema,
  itinerarySchema,
  itineraryEditContextSchema,
  itineraryWriteInput,
  itineraryWriteStateSchema,
  activityDeletionInput,
  activityDeletionPreviewInput,
  activityDeletionPreviewSchema,
  activityDeletionStateSchema,
  expensesSchema,
  expenseDetailSchema,
  settlementSchema,
  expenseOptionsSchema,
  expensePreviewInput,
  expensePreviewSchema,
  expenseCreateInput,
  expenseRequestSchema,
  MAX_EXPENSE_AMOUNT,
  tripMembersSchema,
  tripAccessContextSchema,
  tripAccessInput,
  tripAccessResultSchema,
  memberClaimInvitationSchema,
  virtualMemberCreateInput,
  virtualMemberRenameInput,
  memberMutationResultSchema,
  tripSettingsSchema,
  tripCurrencyContextSchema,
  tripCurrencyInput,
  referenceRatesSchema,
  tripUpdateInput,
  tripArchiveInput,
  tripManagementResultSchema,
  tripCreateInput,
  tripJoinInput,
  tripMutationResultSchema,
  invitationSchema,
  mutationRequestSchema,
  paymentContextSchema,
  paymentRevokeContextSchema,
  paymentCreateInput,
  paymentDeleteInput,
  paymentMutationResultSchema,
  expenseEditContextSchema,
  expenseUpdateInput,
  expenseDeleteInput,
  expenseMutationResultSchema,
} from '../src/index.ts';

const maxAmount = MAX_EXPENSE_AMOUNT.toLocaleString('en-US', { minimumFractionDigits: 2 });

const schemas = Object.fromEntries(
  Object.entries({
    ...v2Schemas,
    TripMembers: tripMembersSchema,
    TripAccessContext: tripAccessContextSchema,
    TripAccessInput: tripAccessInput,
    TripAccessResult: tripAccessResultSchema,
    MemberClaimInvitation: memberClaimInvitationSchema,
    VirtualMemberCreateInput: virtualMemberCreateInput,
    VirtualMemberRenameInput: virtualMemberRenameInput,
    MemberMutationResult: memberMutationResultSchema,
    TripCurrencyContext: tripCurrencyContextSchema,
    TripCurrencyInput: tripCurrencyInput,
    ReferenceRates: referenceRatesSchema,
    TripSettings: tripSettingsSchema,
    TripUpdateInput: tripUpdateInput,
    TripArchiveInput: tripArchiveInput,
    TripManagementResult: tripManagementResultSchema,
    TripCreateInput: tripCreateInput,
    TripJoinInput: tripJoinInput,
    TripMutationResult: tripMutationResultSchema,
    Invitation: invitationSchema,
    MutationRequest: mutationRequestSchema,
    PaymentContext: paymentContextSchema,
    PaymentRevokeContext: paymentRevokeContextSchema,
    PaymentCreateInput: paymentCreateInput,
    PaymentDeleteInput: paymentDeleteInput,
    PaymentMutationResult: paymentMutationResultSchema,
    ExpenseEditContext: expenseEditContextSchema,
    ExpenseUpdateInput: expenseUpdateInput,
    ExpenseDeleteInput: expenseDeleteInput,
    ExpenseMutationResult: expenseMutationResultSchema,
    RegisterInput: registerInput,
    PasswordResetRequestInput: passwordResetRequestInput,
    PasswordResetInput: passwordResetInput,
    PasswordResetAccepted: passwordResetAcceptedSchema,
    PasswordResetResult: passwordResetResultSchema,
    LoginInput: loginInput,
    RefreshInput: refreshInput,
    User: userSchema,
    AvatarContext: avatarContextSchema,
    AvatarWriteInput: avatarWriteInput,
    AvatarWriteState: avatarWriteStateSchema,
    AvatarUploadTicket: avatarUploadTicketSchema,
    AvatarWriteCommandInput: avatarWriteCommandInput,
    EmailChangeRequestInput: emailChangeRequestInput,
    EmailChangeConfirmInput: emailChangeConfirmInput,
    EmailChangeCancelInput: emailChangeCancelInput,
    EmailChangeSentSchema: emailChangeSentSchema,
    EmailChangeResultSchema: emailChangeResultSchema,
    EmailChangeCancelledSchema: emailChangeCancelledSchema,
    PasswordChangeInput: passwordChangeInput,
    PasswordChangeResult: passwordChangeResultSchema,
    AccountProfile: accountProfileSchema,
    AccountProfileInput: accountProfileInput,
    NotificationPreferences: notificationPreferencesSchema,
    NotificationPreferencesInput: notificationPreferencesInput,
    Friends: friendsSchema,
    FriendInviteInput: friendInviteInput,
    FriendCommandInput: friendCommandInput,
    FriendMutation: friendMutationSchema,
    Session: sessionSchema,
    Trips: tripsSchema,
    TripListQuery: tripListQuerySchema,
    TripListMetadata: tripListMetadataSchema,
    Landing: landingSchema,
    Itinerary: itinerarySchema,
    ItineraryEditContext: itineraryEditContextSchema,
    ItineraryWriteInput: itineraryWriteInput,
    ItineraryWriteState: itineraryWriteStateSchema,
    ActivityDeletionInput: activityDeletionInput,
    ActivityDeletionPreviewInput: activityDeletionPreviewInput,
    ActivityDeletionPreview: activityDeletionPreviewSchema,
    ActivityDeletionState: activityDeletionStateSchema,
    Expenses: expensesSchema,
    ExpenseDetail: expenseDetailSchema,
    Settlement: settlementSchema,
    ExpenseOptions: expenseOptionsSchema,
    ExpensePreviewInput: expensePreviewInput,
    ExpensePreview: expensePreviewSchema,
    ExpenseCreateInput: expenseCreateInput,
    ExpenseRequest: expenseRequestSchema,
    Logout: logoutResultSchema,
    Error: z.object({ error: z.object({ code: z.string() }), requestId: z.string() }),
  }).map(([name, schema]) => {
    const { $schema, ...json } = z.toJSONSchema(schema, {
      io: name.endsWith('Input') ? 'input' : 'output',
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
const operation = (
  id,
  output,
  input,
  { authenticated = !input, errors = {}, description } = {}
) => ({
  operationId: id,
  description,
  security: authenticated ? [{ bearerAuth: [] }] : [],
  ...(input
    ? { requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } } }
    : {}),
  responses: {
    200: response(output),
    ...Object.fromEntries(
      [400, 401, 404, 413, 415, 429, 500, ...Object.keys(errors).map(Number)]
        .sort((a, b) => a - b)
        .map((status) => [
          status,
          {
            description: errors[status] ?? 'Error code; 429 includes Retry-After seconds',
            content: { 'application/json': { schema: ref('Error') } },
          },
        ])
    ),
  },
});
// Trip routes opt in to the ledger failure reported by their output/validation adapter.
const ledgerFailure = 'LEDGER_DATA_INVALID or MONEY_TOTAL_OUT_OF_RANGE.';
const ledgerOperation = (id, output, input, options = {}) =>
  operation(id, output, input, { ...options, errors: { 503: ledgerFailure, ...options.errors } });
const dateParam = {
  name: 'date',
  in: 'query',
  description: 'Device calendar date. Defaults to server UTC date if omitted.',
  schema: { type: 'string', format: 'date' },
};
const objectId = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' };
const tripIdParam = { name: 'id', in: 'path', required: true, schema: objectId };
// Shared operation templates; only their v2 forms below are published (v1 retired in B5d-2).
const templates = {
  '/auth/register': {
    post: {
      ...operation('register', 'User', 'RegisterInput', {
        errors: { 409: 'ACCOUNT_CONFLICT: username or email already in use.' },
      }),
      description:
        'Creates an account without a session. ACCOUNT_CONFLICT covers either username or email. New passwords: minimum 6 characters, maximum 72 UTF-8 bytes; never trimmed. Timeout/5xx: outcome unknown; try login, never automatically resend or persist the password.',
    },
  },
  '/auth/password-reset/request': {
    post: {
      ...operation('requestPasswordReset', 'PasswordResetAccepted', 'PasswordResetRequestInput'),
      description:
        'Same accepted response for all emails; delivery is best effort. Per normalized email: once per 60 seconds, five per rolling hour. Trusted source: shared registration/send limit of twenty per rolling hour. 429 includes Retry-After.',
    },
  },
  '/auth/password-reset/confirm': {
    post: {
      ...operation('resetPassword', 'PasswordResetResult', 'PasswordResetInput'),
      description:
        'Six-digit string, including leading zeros; valid 15 minutes, five incorrect attempts, ten verification requests per email per rolling 15 minutes. Password update and code consumption are atomic; one concurrent success. Resend invalidates the previous code. All previous Mobile sessions and Web cookies expire after password change. Timeout/5xx: try logging in with the new password.',
    },
  },
  '/auth/login': { post: operation('login', 'Session', 'LoginInput') },
  '/auth/refresh': { post: operation('refresh', 'Session', 'RefreshInput') },
  '/auth/logout': { post: operation('logout', 'Logout', 'RefreshInput') },
  '/me': { get: operation('me', 'User') },
  '/me/email/request': {
    post: operation('requestEmailChange', 'EmailChangeSentSchema', 'EmailChangeRequestInput', {
      description: 'Send a verification code to the proposed new email address.',
      authenticated: true,
      errors: {
        409: 'CONFLICT or RESOURCE_CHANGED.',
        503: 'EMAIL_DELIVERY_FAILED: the verification email could not be delivered.',
      },
    }),
  },
  '/me/email/confirm': {
    post: operation('confirmEmailChange', 'EmailChangeResultSchema', 'EmailChangeConfirmInput', {
      description: 'Verify the code and update the signed-in account’s email address.',
      authenticated: true,
      errors: { 409: 'CONFLICT or RESOURCE_CHANGED.' },
    }),
  },
  '/me/email/cancel': {
    post: operation('cancelEmailChange', 'EmailChangeCancelledSchema', 'EmailChangeCancelInput', {
      description: 'Cancel the pending email change for the signed-in account.',
      authenticated: true,
    }),
  },
  '/me/password': {
    post: operation('changePassword', 'PasswordChangeResult', 'PasswordChangeInput', {
      description:
        'Verify the current password and set a new one. A successful change invalidates previous sessions.',
      authenticated: true,
      errors: { 409: 'RESOURCE_CHANGED: the credentials changed during the request.' },
    }),
  },
  '/me/friends': {
    get: operation('friends', 'Friends', undefined, {
      description: 'List the signed-in user’s friends and incoming and outgoing invitations.',
      authenticated: true,
    }),
    post: operation('inviteFriend', 'FriendMutation', 'FriendInviteInput', {
      description: 'Send a friend invitation to the specified user.',
      authenticated: true,
      errors: { 409: 'Friendship state conflicts with this invitation.' },
    }),
  },
  '/me/friends/{friendshipId}': {
    post: {
      ...operation('changeFriendship', 'FriendMutation', 'FriendCommandInput', {
        authenticated: true,
        errors: { 409: 'Friendship state conflicts with the command.' },
      }),
      parameters: [
        {
          name: 'friendshipId',
          in: 'path',
          required: true,
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
      ],
      description:
        'Recipient accepts/declines pending invitations; requester withdraws; either participant removes an accepted friendship. Unknown outcomes must be checked by reading current friends; never automatically resend.',
    },
  },
  '/me/notification-preferences': {
    get: operation('notificationPreferences', 'NotificationPreferences', undefined, {
      description: 'Read the signed-in user’s notification preferences.',
      authenticated: true,
    }),
    patch: {
      ...operation(
        'updateNotificationPreferences',
        'NotificationPreferences',
        'NotificationPreferencesInput',
        { authenticated: true }
      ),
      description:
        'Self-only partial settings update; at least one field required. Notification locale is independent of device/UI locale. On unknown outcomes read current settings before deciding to save again. No ledger journal.',
    },
  },
  '/me/profile': {
    get: operation('accountProfile', 'AccountProfile', undefined, {
      description: 'Read the signed-in user’s profile.',
      authenticated: true,
    }),
    patch: {
      ...operation('updateAccountProfile', 'AccountProfile', 'AccountProfileInput', {
        authenticated: true,
      }),
      description:
        'Self-only display name update. Email and username are read-only. Explicit online save; on an unknown outcome read the profile before deciding whether to save again. No ledger/outbox operation.',
    },
  },
  '/me/avatar': {
    get: operation('accountAvatar', 'AvatarContext', undefined, {
      description: 'Read the current avatar and revision for the signed-in user.',
      authenticated: true,
    }),
  },
  '/me/avatar/requests': {
    post: operation('beginAvatarWrite', 'AvatarWriteState', 'AvatarWriteInput', {
      description: 'Begin an avatar change under the original request UUID.',
      authenticated: true,
      errors: { 409: 'Avatar write conflicts with the current request or avatar state.' },
    }),
  },
  '/me/avatar/requests/{clientRequestId}': {
    get: {
      ...operation('avatarWriteStatus', 'AvatarWriteState', undefined, {
        description: 'Look up the signed-in user’s avatar change by its request UUID.',
        authenticated: true,
      }),
      parameters: [
        {
          name: 'clientRequestId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
    },
    post: {
      ...operation('commandAvatarWrite', 'AvatarUploadTicket', 'AvatarWriteCommandInput', {
        description: 'Request an upload ticket, finish the upload, or cancel the avatar change.',
        authenticated: true,
        errors: { 409: 'Avatar command conflicts with the current upload or request state.' },
      }),
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
  '/trips/join': {
    post: ledgerOperation('joinTrip', 'TripMutationResult', 'TripJoinInput', {
      authenticated: true,
      errors: { 409: 'Conflicting request identity or incompatible stored receipt.' },
    }),
  },
  '/mutation-requests/{clientRequestId}': {
    get: {
      ...ledgerOperation('mutationRequest', 'MutationRequest', undefined, {
        errors: { 409: 'CLIENT_UPGRADE_REQUIRED for a receipt stored by v1.' },
      }),
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
    get: { ...ledgerOperation('invitation', 'Invitation'), parameters: [tripIdParam] },
  },
  '/trips': {
    post: ledgerOperation('createTrip', 'TripMutationResult', 'TripCreateInput', {
      authenticated: true,
      errors: { 409: 'Conflicting request identity or incompatible stored receipt.' },
    }),
    get: {
      ...ledgerOperation('trips', 'Trips'),
      parameters: [
        dateParam,
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 999999, default: 1 },
        },
        {
          name: 'archive',
          in: 'query',
          schema: { type: 'string', enum: ['all', 'unarchived', 'archived'], default: 'all' },
        },
        {
          name: 'sort',
          in: 'query',
          schema: { type: 'string', enum: ['legacy', 'list', 'quick-add'], default: 'legacy' },
        },
        {
          name: 'preferred_trip_id',
          in: 'query',
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
          description:
            'Optional quick-add preference. Only reorders within the same group before pagination; does not change uniqueness or authorize access.',
        },
      ],
      description:
        '20 items/page after filtering/sorting. Defaults preserve legacy mixed order. sort=list pins ongoing/upcoming only for unarchived trips, then descending departure year/date, undated last. sort=quick-add requires archive=unarchived and uses Web quick-add order. preferred_trip_id is valid only for quick-add, is echoed as metadata.preferredTripId, and is ignored when absent from authorized unarchived candidates. metadata counts and quickAdd decision cover all authorized trips, even on empty pages. Pagination is not a snapshot; reset to page 1 after changes.',
    },
  },
  '/trips/{id}/expenses/{expenseId}/attachment-requests': {
    post: {
      ...ledgerOperation('receiptBegin', 'V2ReceiptWriteState', 'V2ReceiptWriteInput', {
        authenticated: true,
        errors: { 409: 'Attachment request conflicts with the current state.' },
      }),
      parameters: [
        tripIdParam,
        { name: 'expenseId', in: 'path', required: true, schema: objectId },
      ],
      description:
        'Private attachment add/remove intent. Save UUID before sending; replay same body only. No financial changes. Add requires upload and finish; remove commits immediately.',
    },
  },
  '/trips/{id}/expenses/{expenseId}/attachment-requests/{clientRequestId}': {
    get: {
      ...ledgerOperation('receiptWriteStatus', 'V2ReceiptWriteState', undefined, {
        errors: {
          409: 'IDEMPOTENCY_CONFLICT: the request belongs to a different trip or expense.',
        },
      }),
      parameters: [
        tripIdParam,
        { name: 'expenseId', in: 'path', required: true, schema: objectId },
        {
          name: 'clientRequestId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
    },
    post: {
      ...ledgerOperation('receiptWriteCommand', 'V2ReceiptUploadTicket', 'V2ReceiptWriteCommand', {
        authenticated: true,
        errors: { 409: 'Attachment command conflicts with the current upload or request state.' },
      }),
      parameters: [
        tripIdParam,
        { name: 'expenseId', in: 'path', required: true, schema: objectId },
        {
          name: 'clientRequestId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      description:
        'Upload ticket requires Content-Type and If-None-Match:* PUT headers, no bearer credential. 120-second URL, 24-hour pending lifetime. Finish checks HEAD then commits reference and terminal result in one authorized transaction. Cancel retires unused blob. Always query original UUID after ambiguity.',
    },
  },
  '/trips/{id}/expenses/{expenseId}/attachments': {
    get: {
      ...ledgerOperation('receiptAttachments', 'V2ReceiptAttachments', undefined, {
        errors: {
          503: `${ledgerFailure} ATTACHMENT_DATA_INVALID for inconsistent attachment metadata.`,
        },
      }),
      description:
        'Member-only attached receipt metadata. Opaque IDs, MIME type and bytes only; no storage keys or URLs. No public fallback or persistent cache.',
      parameters: [
        tripIdParam,
        {
          name: 'expenseId',
          in: 'path',
          required: true,
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
      ],
    },
  },
  '/trips/{id}/expenses/{expenseId}/attachments/{attachmentId}': {
    get: {
      ...ledgerOperation('receiptView', 'V2ReceiptView', undefined, {
        errors: {
          503: `${ledgerFailure} ATTACHMENT_DATA_INVALID for inconsistent attachment metadata.`,
        },
      }),
      description:
        'Reauthorizes membership and expense attachment before and after storage checks. Returns a fresh HTTPS URL valid at most 300 seconds, with private no-store response override. Missing/detached objects: 404 ATTACHMENT_UNAVAILABLE. Previously issued URLs may remain valid until expiry; external viewers control their own downloads. No-store API response.',
      parameters: [
        tripIdParam,
        {
          name: 'expenseId',
          in: 'path',
          required: true,
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
        {
          name: 'attachmentId',
          in: 'path',
          required: true,
          schema: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        },
      ],
    },
  },
  '/trips/{id}/expense-search': {
    get: {
      ...ledgerOperation('expenseSearch', 'V2ExpenseSearch', undefined, {
        authenticated: true,
        errors: { 409: 'RESOURCE_CHANGED: restart pagination from the first page.' },
      }),
      description:
        'Member-only full-trip literal description/payer search. AND filters: keyword (trimmed, max 200), category, payerId (id or missing), inclusive dateFrom/dateTo (YYYY-MM-DD). Unknown/repeated keys or invalid ranges return 400. Twenty rows per page, date/createdAt/id descending. Same snapshot supplies all matching totals, own normalized shares, category and member analysis. Cursor binds actor/trip/filters/result revision; changed results return 409 RESOURCE_CHANGED, restart page 1. No private budgets, tags, receipts, drafts or repayments.',
      parameters: [
        tripIdParam,
        ...['keyword', 'category', 'payerId', 'dateFrom', 'dateTo', 'cursor'].map((name) => ({
          name,
          in: 'query',
          schema: schemas.V2ExpenseSearchInput.properties[name],
        })),
      ],
    },
  },
  '/trips/{id}/budget': {
    get: {
      ...ledgerOperation('budgetContext', 'V2BudgetContext'),
      description:
        'Signed-in member only: private total/category budget, opaque personal revision and all recorded trip expense shares using the Web calculator. No other member budgets, drafts or repayments.',
      parameters: [tripIdParam],
    },
    post: {
      ...ledgerOperation('setBudget', 'V2BudgetMutationResult', 'V2BudgetInput', {
        authenticated: true,
        errors: {
          409: 'Budget revision, base currency, or request identity conflicts with the confirmed input.',
        },
      }),
      description:
        'Full replacement of the actor budget in the immutable trip base currency. Zero/null removes a limit; unique categories and cent precision required. Same Web revision/transaction and original UUID budget.set receipt; conflict requires receipt lookup and fresh review.',
      parameters: [tripIdParam],
    },
  },
  '/trips/{id}/currency-settings': {
    get: {
      ...ledgerOperation('tripCurrencySettings', 'TripCurrencyContext'),
      parameters: [tripIdParam],
    },
    post: {
      ...ledgerOperation('updateTripCurrency', 'TripManagementResult', 'TripCurrencyInput', {
        authenticated: true,
        errors: {
          403: 'Insufficient trip permissions.',
          409: 'Currency settings, revision, or request identity conflict.',
        },
      }),
      parameters: [tripIdParam],
      description:
        'Admin-only full replacement. Opaque settings revision, original UUID receipt. Existing expenses and confirmed requests remain unchanged.',
    },
  },
  '/trips/{id}/settings': {
    get: { ...ledgerOperation('tripSettings', 'TripSettings'), parameters: [tripIdParam] },
  },
  '/trips/{id}': {
    patch: {
      ...ledgerOperation('updateTrip', 'TripManagementResult', 'TripUpdateInput', {
        authenticated: true,
        errors: {
          403: 'Insufficient trip permissions.',
          409: 'Trip revision or request identity conflicts with the update.',
        },
      }),
      parameters: [tripIdParam],
    },
  },
  '/trips/{id}/archive': {
    post: {
      ...ledgerOperation('archiveTrip', 'TripManagementResult', 'TripArchiveInput', {
        authenticated: true,
        errors: { 409: 'Archive revision or request identity conflicts with the update.' },
      }),
      parameters: [tripIdParam],
    },
  },
  '/trips/{id}/access': {
    get: {
      ...ledgerOperation('tripAccessContext', 'TripAccessContext'),
      parameters: [tripIdParam],
      description:
        'Member-only current roster and deletion counts; opaque revision includes all deleted records.',
    },
    post: {
      ...ledgerOperation('manageTripAccess', 'TripAccessResult', 'TripAccessInput', {
        authenticated: true,
        errors: {
          403: 'Insufficient trip permissions.',
          409: 'Trip access revision or request identity conflicts with the command.',
        },
      }),
      parameters: [tripIdParam],
      description:
        'Admin role/removal/delete, own leave. Fresh revision, one UUID. Only successful leave/delete receipts may be replayed by their original actor after membership loss.',
    },
  },
  '/trips/{id}/members/{memberId}/claim-invitation': {
    get: {
      ...ledgerOperation('memberClaimInvitation', 'MemberClaimInvitation'),
      parameters: [tripIdParam, { name: 'memberId', in: 'path', required: true, schema: objectId }],
      description:
        'Admin only. Existing Web claim capability for a current virtual member. Recipient registers or logs in on Web. Share-code rotation revokes the link.',
    },
  },
  '/trips/{id}/members': {
    get: {
      ...ledgerOperation('tripMembers', 'TripMembers'),
      parameters: [tripIdParam],
      description:
        'Current authorized member roster in joined order. No username, email or budget.',
    },
    post: {
      ...ledgerOperation(
        'createVirtualMember',
        'MemberMutationResult',
        'VirtualMemberCreateInput',
        {
          authenticated: true,
          errors: {
            403: 'Insufficient trip permissions.',
            409: 'Roster revision or request identity conflicts with the command.',
          },
        }
      ),
      parameters: [tripIdParam],
      description:
        'Admin only. Persist one UUID before sending; stale roster yields a terminal rejection. Replay is authorized as a current member.',
    },
  },
  '/trips/{id}/members/{memberId}': {
    patch: {
      ...ledgerOperation(
        'renameVirtualMember',
        'MemberMutationResult',
        'VirtualMemberRenameInput',
        {
          authenticated: true,
          errors: {
            403: 'Insufficient trip permissions.',
            409: 'Roster revision or request identity conflicts with the command.',
          },
        }
      ),
      parameters: [tripIdParam, { name: 'memberId', in: 'path', required: true, schema: objectId }],
      description:
        'Admin only, current virtual members only. Same UUID and payload for every retry; query the original result after an ambiguous response.',
    },
  },
  '/trips/{id}/landing': {
    get: {
      ...ledgerOperation('landing', 'Landing'),
      parameters: [tripIdParam, dateParam],
    },
  },
  '/trips/{id}/expenses': {
    get: {
      ...ledgerOperation('expenses', 'Expenses'),
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
      ...ledgerOperation('createExpense', 'ExpenseDetail', 'ExpenseCreateInput', {
        authenticated: true,
        errors: {
          409: 'Conflicting request identity, incompatible receipt, or mismatched trip base currency.',
        },
      }),
      parameters: [tripIdParam],
      description: `Creates a split expense in the trip base currency. exchange_rate is base currency per unit of original currency, and is 1 when the currencies match. The converted total and individual shares use two decimals and may not exceed ${maxAmount}. After an unknown outcome, look up the original client_request_id and reuse the same UUID and body on retry. Replays are authorized again and return the original result even after deletion.`,
    },
  },
  '/trips/{id}/expenses/preview': {
    post: {
      ...ledgerOperation('previewExpense', 'ExpensePreview', 'ExpensePreviewInput', {
        authenticated: true,
        errors: {
          409: 'LEDGER_CURRENCY_MISMATCH: base_currency differs from the trip base currency.',
        },
      }),
      parameters: [tripIdParam],
      description:
        'Previews a split in the trip base currency using the supplied original amount and exchange rate. Omit split for equal allocation. Shares follow expense-options member order. The preview is read-only.',
    },
  },
  '/trips/{id}/expense-options': {
    get: {
      ...ledgerOperation('expenseOptions', 'ExpenseOptions'),
      parameters: [tripIdParam],
      description:
        'Trip members (earliest joined first, virtual members included; ids, display names and optional virtual flags only) and the expense categories. Members only.',
    },
  },
  '/trips/{id}/expense-requests/{clientRequestId}': {
    get: {
      ...ledgerOperation('expenseRequest', 'ExpenseRequest', undefined, {
        errors: { 409: 'CLIENT_UPGRADE_REQUIRED for a receipt stored by v1.' },
      }),
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
  '/trips/{id}/expenses/{expenseId}/edit-context': {
    get: {
      ...ledgerOperation('expenseEditContext', 'ExpenseEditContext'),
      parameters: [
        tripIdParam,
        { name: 'expenseId', in: 'path', required: true, schema: objectId },
      ],
    },
  },
  '/trips/{id}/expenses/{expenseId}': {
    patch: {
      ...ledgerOperation('updateExpense', 'ExpenseMutationResult', 'ExpenseUpdateInput', {
        authenticated: true,
        errors: {
          409: 'Expense state, revision, base currency, or request identity conflicts with the update.',
        },
      }),
      description:
        'Basic edits preserve accounting fields. Equal and split recalculations require the original currency, exchange rate and confirmed shares. Supply the expected revision, trip base currency and original request UUID.',
      parameters: [
        tripIdParam,
        { name: 'expenseId', in: 'path', required: true, schema: objectId },
      ],
    },
    delete: {
      ...ledgerOperation('deleteExpense', 'ExpenseMutationResult', 'ExpenseDeleteInput', {
        authenticated: true,
        errors: {
          409: 'Expense state, revision, base currency, or request identity conflicts with deletion.',
        },
      }),
      parameters: [
        tripIdParam,
        { name: 'expenseId', in: 'path', required: true, schema: objectId },
      ],
    },
    get: {
      ...ledgerOperation('expense', 'ExpenseDetail'),
      parameters: [
        tripIdParam,
        { name: 'expenseId', in: 'path', required: true, schema: objectId },
      ],
      description:
        'Amount and shares use two decimals in the trip base currency; originalAmount, currency and exchangeRate describe the entered value. An expense of another trip returns 404.',
    },
  },
  '/trips/{id}/payment-context': {
    get: {
      ...ledgerOperation('paymentContext', 'PaymentContext'),
      parameters: [tripIdParam],
      description:
        'Fresh members and backend settlement in one snapshot, with an opaque trip-bound revision. External payments only; suggestions are unpaid.',
    },
  },
  '/trips/{id}/payments': {
    post: {
      ...ledgerOperation('createPayment', 'PaymentMutationResult', 'PaymentCreateInput', {
        authenticated: true,
        errors: {
          409: 'Settlement revision, base currency, or request identity conflicts with the payment.',
        },
      }),
      parameters: [tripIdParam],
      description:
        'Records an external payment in the trip base currency (two decimals, 0.01 to 1,000,000,000). Partial, excess and manual payments are allowed. UUID/immutable body survive every retry. SETTLEMENT_CHANGED is a terminal receipt: reload and explicitly reconfirm with a new UUID. Timeout/5xx: lookup original mutation request; never change UUID. Replay after revocation does not resurrect the payment.',
    },
  },
  '/trips/{id}/payments/{paymentId}/revoke-context': {
    get: {
      ...ledgerOperation('paymentRevokeContext', 'PaymentRevokeContext'),
      parameters: [
        tripIdParam,
        { name: 'paymentId', in: 'path', required: true, schema: objectId },
      ],
      description:
        'Current direction, amount, note and opaque raw payment revision. RESOURCE_GONE is a resource-only 404.',
    },
  },
  '/trips/{id}/payments/{paymentId}': {
    delete: {
      ...ledgerOperation('revokePayment', 'PaymentMutationResult', 'PaymentDeleteInput', {
        authenticated: true,
        errors: {
          409: 'Payment state, revision, base currency, or request identity conflicts with revocation.',
        },
      }),
      parameters: [
        tripIdParam,
        { name: 'paymentId', in: 'path', required: true, schema: objectId },
      ],
      description:
        'Revokes a mistaken registration; does not refund money. Every member may revoke. Raw payment revision guards identity changes; original creation receipt remains valid.',
    },
  },
  '/trips/{id}/settlement': {
    get: {
      ...ledgerOperation('settlement', 'Settlement'),
      parameters: [tripIdParam],
      description:
        'Balances already include registered payments. suggestedTransfers are suggestions only and have not been paid. status distinguishes no expenses, settled and outstanding.',
    },
  },
};
const rewriteV2 = (value) => {
  if (Array.isArray(value)) return value.map(rewriteV2);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => {
      if (key === '$ref' && typeof v === 'string') {
        const name = v.split('/').at(-1);
        return [key, v2Schemas[`V2${name}`] ? `#/components/schemas/V2${name}` : v];
      }
      if (key === 'operationId') return [key, `${v}V2`];
      return [key, rewriteV2(v)];
    })
  );
};
const paths = Object.fromEntries(
  Object.entries(templates).map(([path, item]) => [`/v2${path}`, rewriteV2(item)])
);
paths['/v2/trips/{id}/itinerary'] = {
  get: {
    ...operation('tripItinerary', 'Itinerary'),
    parameters: [tripIdParam],
    description:
      'Bearer member-only, no public fallback. Unknown/malformed trips and non-members return 404. Days ordered by dayNumber; activity start time ascending, untimed last, stable ties. Dates use UTC calendar-day arithmetic from trip start; gaps are preserved. No attachment metadata, storage keys, URLs, photos or collaborator identities. Private no-store response; no ledger amounts.',
  },
};
paths['/v2/trips/{id}/itinerary/edit-context'] = {
  get: {
    ...operation('itineraryEditContext', 'ItineraryEditContext'),
    parameters: [tripIdParam],
    description:
      'Current admins only; same ordered reader plus day/activity revisions and deletion impact counts/revision. No tickets, storage keys or collaborator identities. Read-only snapshot, no fence writes.',
  },
};
paths['/v2/trips/{id}/itinerary/requests'] = {
  post: {
    ...operation('itineraryWrite', 'ItineraryWriteState', 'ItineraryWriteInput', {
      authenticated: true,
    }),
    parameters: [tripIdParam],
    description:
      'Admin-only confirmed online command; persist UUID/body/account/environment before sending. Strict six-operation body; no attachments, AI or bulk activity replacement. Atomic mutation and terminal receipt, replay returns original IDs/revisions even if deleted since. Conflicts/rejections return a terminal rejected state. Changed body/trip under same actor UUID: 409 IDEMPOTENCY_CONFLICT. Unknown transport/5xx: query original UUID; only not_found permits retry of exact frozen command. Not_found is not proof of failure. 256 KiB body cap.',
  },
};
paths['/v2/trips/{id}/itinerary/requests/{uuid}'] = {
  get: {
    ...operation('itineraryRequest', 'ItineraryWriteState'),
    parameters: [
      tripIdParam,
      { name: 'uuid', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    description:
      'Current admins only; own actor/trip receipt, read-only, no TTL or fence write. No result inference from current resource. Revocation denies recovery; original receipt remains for reauthorized account. No ledger/private content in receipt.',
  },
};
paths['/v2/trips/{id}/itinerary/activity-deletions/preview'] = {
  post: {
    ...operation(
      'activityDeletionPreview',
      'ActivityDeletionPreview',
      'ActivityDeletionPreviewInput'
    ),
    parameters: [tripIdParam],
    description:
      'Admin read-only snapshot for 1–15 distinct same-day activities. Missing/changed targets are explicit. Opaque confirmation revision covers day date/title and selected activity/ticket references, not siblings. No storage keys in reply.',
  },
};
paths['/v2/trips/{id}/itinerary/activity-deletions'] = {
  post: {
    ...operation('activityDeletionWrite', 'ActivityDeletionState', 'ActivityDeletionInput'),
    parameters: [tripIdParam],
    description:
      'Admin-only atomic batch and terminal receipt, shared actor/UUID namespace with single itinerary commands. All targets must match original revisions and confirmation context. Keeps day, expenses, photos and achievements; retires only unreferenced tickets. Persist frozen intent before sending; unknown results require original UUID lookup. not_found permits only explicit exact retry. Target order is canonicalized. No private text/keys in receipt.',
  },
};
paths['/v2/trips/{id}/itinerary/activity-deletions/{uuid}'] = {
  get: {
    ...operation('activityDeletionLookup', 'ActivityDeletionState'),
    parameters: [
      tripIdParam,
      { name: 'uuid', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    description:
      'Current admin authorization, own actor/trip receipt. Read-only, no TTL or fence write; resource disappearance does not change committed result. Query denial is not proof of rejection.',
  },
};
paths['/v2/capabilities'] = { get: operation('ledgerCapabilitiesV2', 'V2Capabilities') };
paths['/v2/trips/{id}/exchange-rates'] = {
  parameters: [tripIdParam],
  get: ledgerOperation('tripReferenceRatesV2', 'V2ReferenceRates', undefined, {
    errors: {
      503: `${ledgerFailure} SERVICE_UNAVAILABLE if reference rates cannot be loaded or rebased.`,
    },
  }),
};

// Publish only the schemas the v2 paths reach; v1-only DTOs stay in the TypeScript package.
const reachable = new Set();
const visit = (value) => {
  if (Array.isArray(value)) return value.forEach(visit);
  if (!value || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    if (key === '$ref' && typeof v === 'string') {
      const name = v.split('/').at(-1);
      if (!reachable.has(name)) {
        reachable.add(name);
        visit(schemas[name]);
      }
    } else visit(v);
  }
};
visit(paths);
const published = Object.fromEntries(Object.entries(schemas).filter(([n]) => reachable.has(n)));

const output = new URL('../openapi.json', import.meta.url);
const generated =
  JSON.stringify(
    {
      openapi: '3.1.0',
      info: {
        title: 'Travel Budget mobile HTTP API',
        version: 'v2',
        description:
          'Contract version, independent of application version. Native client; no cross-origin browser access. Refresh rotation is single-use; replay revokes the device session. Absolute 30-day lifetime, 15-minute access token. Logout uses refreshToken. Dates are date-only; money explicitly identifies the immutable trip base currency, with two decimals. The retired v1 routes are not published.',
      },
      servers: [{ url: '/api' }],
      paths,
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
        schemas: published,
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
