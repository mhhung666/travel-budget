'use server';
import mongoose from 'mongoose';
import { withLedgerAuth } from './withAuth';
import { getTripMembership } from '@/lib/permissions';
import { dbConnect } from '@/lib/mongodb';
import { ledgerCapabilities, currentLedger } from '@/lib/ledger';
import { readReferenceRates, rebaseReferenceRates } from '@/lib/referenceRates';
import { getAllCurrencyCodes } from '@/constants/currencies';
import { readTripMutation } from '@/lib/tripEntry';
export const getLedgerCapabilities = withLedgerAuth(async () => ({
  success: true as const,
  data: ledgerCapabilities(),
}));
export const getTripReferenceRates = withLedgerAuth(async (session, id: string) => {
  const member = await getTripMembership(session.userId, id);
  if (!member) return { success: false as const, error: 'NOT_FOUND', code: 'NOT_FOUND' as const };
  const ledger = currentLedger();
  const snapshot = await readReferenceRates();
  return {
    success: true as const,
    data: { ...rebaseReferenceRates(snapshot, ledger.baseCurrency, getAllCurrencyCodes()), ledger },
  };
});
export const getLedgerMutation = withLedgerAuth(async (session, id: string) => {
  await dbConnect();
  const { readWebSettingsReceipt } = await import('@/lib/webSettingsWrite');
  return {
    success: true as const,
    data:
      (await readWebSettingsReceipt(mongoose.connection.db!, session.userId, id)) ??
      (await readTripMutation(mongoose.connection.db!, session.userId, id)),
  };
});

export const writeWebPayment = withLedgerAuth(
  async (
    session,
    id: string,
    operation: 'payment.create' | 'payment.delete',
    body: unknown,
    paymentId?: string
  ) => {
    const member = await getTripMembership(session.userId, id);
    if (!member) return { success: false as const, error: 'NOT_FOUND', code: 'NOT_FOUND' as const };
    const { writePayment } = await import('@/lib/paymentWrite');
    const { getEnv } = await import('@/lib/env');
    const { deliverPaymentNotification } = await import('@/lib/notify');
    return {
      success: true as const,
      data: await writePayment(
        mongoose.connection.db!,
        session.userId,
        member.tripId,
        operation,
        body,
        getEnv().JWT_SECRET,
        paymentId,
        deliverPaymentNotification
      ),
    };
  }
);

export const writeWebTripSettings = withLedgerAuth(
  async (session, id: string, kind: 'budget' | 'currency', body: unknown) => {
    const member = await getTripMembership(session.userId, id);
    if (!member) return { success: false as const, error: 'NOT_FOUND', code: 'NOT_FOUND' as const };
    const { writeWebSettings } = await import('@/lib/webSettingsWrite');
    const terminal = await writeWebSettings(
      mongoose.connection.db!,
      session.userId,
      member.tripId,
      kind,
      body
    );
    if (terminal.status === 'rejected')
      return { success: false as const, error: String(terminal.code), code: 'CONFLICT' as const };
    return { success: true as const, data: terminal.result };
  }
);
