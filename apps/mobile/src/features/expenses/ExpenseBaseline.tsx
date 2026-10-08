import type { ExpenseDetail } from '@/api/contracts';
import { Card, DetailRow } from '@/components/ui';
import { Disclosure } from '@/components/Disclosure';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useMessages } from '@/i18n/useMessages';
import { type MemberLabelIndex, isForeign } from './rows';

/** Read-only original values; hiding optional metadata never changes the edit mode or input. */
export function ExpenseBaseline({
  expense,
  category,
  labels,
  full = false,
}: {
  expense: ExpenseDetail;
  category: string;
  labels: MemberLabelIndex;
  full?: boolean;
}) {
  const t = useMessages();
  const f = useDisplayFormat();
  const payer = { id: expense.payerId, name: expense.payerName, isVirtual: expense.payerIsVirtual };
  const details = (
    <>
      <DetailRow label={t.expenseDescription} value={expense.description} />
      <DetailRow label={t.category} value={category} />
      <DetailRow label={t.date} value={f.date(expense.date)} />
      <DetailRow label={t.paidBy} value={labels.label(payer)} />
      {isForeign(expense) && (
        <>
          <DetailRow
            label={t.originalAmount}
            value={f.originalAmount(expense.originalAmount, expense.currency)}
          />
          <DetailRow label={t.exchangeRate} value={f.rate(expense.exchangeRate)} />
        </>
      )}
    </>
  );
  return (
    <Card testID="expense-maintain-original">
      <DetailRow label={t.currentExpense} value={f.money(expense.amount)} />
      {full ? (
        details
      ) : (
        <Disclosure testID="expense-maintain-details" title={t.currentExpense}>
          {details}
        </Disclosure>
      )}
    </Card>
  );
}
