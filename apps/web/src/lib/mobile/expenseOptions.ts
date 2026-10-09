import { ledgerMismatch, LedgerError } from '@/lib/ledger';
import { Trip } from '@/models';
import { computeSplits } from '@/lib/expenseSplit';
import { roundMoney } from '@/lib/money';
import { getAllCurrencyCodes, isSupportedCurrency } from '@/constants/currencies';
import { MAX_EXPENSE_AMOUNT } from '@travel-budget/contracts';
import { ApiError, readBody } from './http';
import { requireTripMember } from './access';
import {
  expenseCategories,
  expenseOptionsSchema,
  expensePreviewInput,
  expensePreviewSchema,
} from './contract';

type TripMembers = {
  currencySettings?: {
    defaultCurrency?: string | null;
    currencies?: { code: string; rate?: number | null }[];
  } | null;
  members: {
    user: { _id: { toString(): string }; displayName: string; isVirtual?: boolean } | null;
    joinedAt?: Date;
  }[];
};

/**
 * Members who can pay or share an expense, in the one order everything else relies on: earliest
 * joined first, stored order for ties, virtual members included, users that no longer exist left
 * out. This is the order of the Web member list (`getMembers`), so leftover cents of an equal split
 * go to the same member on both clients.
 */
async function readExpenseTrip(tripId: string, withSettings = false) {
  const trip = await Trip.findById(tripId)
    .select(withSettings ? 'members currencySettings' : 'members')
    .populate('members.user', 'displayName isVirtual')
    .lean<TripMembers | null>();
  if (!trip) throw new ApiError(404, 'NOT_FOUND');
  return trip;
}
function membersOf(trip: TripMembers) {
  const joined = (member: TripMembers['members'][number]) =>
    member.joinedAt ? new Date(member.joinedAt).toISOString() : '';
  return trip.members
    .filter((member) => member.user)
    .sort((a, b) => joined(a).localeCompare(joined(b)))
    .map((member) => ({
      id: member.user!._id.toString(),
      displayName: member.user!.displayName,
      isVirtual: member.user!.isVirtual === true,
    }));
}

export async function readExpenseMembers(tripId: string) {
  return membersOf(await readExpenseTrip(tripId));
}

export async function mobileExpenseOptions(userId: string, id: string) {
  const tripId = await requireTripMember(userId, id);
  const trip = await readExpenseTrip(tripId, true);
  const settings = trip.currencySettings;
  return expenseOptionsSchema.parse({
    currencySettings: settings
      ? {
          default_currency: settings.defaultCurrency ?? null,
          currencies: (settings.currencies ?? []).map((c) => ({
            code: c.code,
            rate: c.rate ?? null,
          })),
        }
      : null,
    supportedCurrencies: getAllCurrencyCodes(),
    members: membersOf(trip),
    categories: [...expenseCategories],
  });
}

/**
 * Equal split of an original currency amount, computed by the same `computeSplits` the Web form uses. The result
 * always follows member order, so the request order cannot move the leftover cent. Nothing is
 * stored: creating the expense validates its own payload again. Authorizes before reading the body.
 */
export async function mobileExpensePreview(request: Request, userId: string, id: string) {
  const tripId = await requireTripMember(userId, id);
  const input = await readBody(request, expensePreviewInput);
  if (ledgerMismatch()) throw new LedgerError('LEDGER_CURRENCY_MISMATCH');
  const currency = 'currency' in input ? input.currency : 'TWD';
  const rate = 'exchange_rate' in input ? input.exchange_rate : 1;
  const product = input.amount * rate;
  if (
    roundMoney(input.amount) !== input.amount ||
    !isSupportedCurrency(currency) ||
    !Number.isFinite(product) ||
    roundMoney(product) > MAX_EXPENSE_AMOUNT
  )
    throw new ApiError(400, 'VALIDATION_ERROR');
  const members = await readExpenseMembers(tripId);
  const known = new Set(members.map((member) => member.id));
  if (input.member_ids.some((memberId) => !known.has(memberId))) {
    throw new ApiError(400, 'VALIDATION_ERROR');
  }
  const chosen = new Set(input.member_ids);
  const { twd } = computeSplits(
    'equal',
    members.map((member) => ({ id: member.id, selected: chosen.has(member.id), value: '' })),
    input.amount,
    rate
  );
  return expensePreviewSchema.parse({
    amount: roundMoney(product),
    ...('currency' in input ? { originalAmount: input.amount, currency, exchangeRate: rate } : {}),
    splits: members
      .filter((member) => chosen.has(member.id))
      .map((member) => ({
        userId: member.id,
        displayName: member.displayName,
        shareAmount: twd[member.id],
      })),
  });
}
