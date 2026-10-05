import { useEffect, useId, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
  type TextInput,
} from 'react-native';
import type { ExpenseOptions } from '@/api/contracts';
import {
  Action,
  Card,
  Chip,
  Copy,
  DetailRow,
  Notice,
  Page,
  Section,
  TextField,
  Title,
  usePalette,
} from '@/components/ui';
import { goBack } from '@/components/navigation';
import { useAuth } from '@/features/auth/AuthProvider';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { localDate, money } from '@/i18n/format';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import {
  confirmedFields,
  newDraft,
  previewInputOf,
  previewKey,
  validateDraft,
  type DraftIssue,
  type ExpenseDraft,
} from './draft';
import type { EntryOutcome, UnconfirmedReason } from './entry';
import { issueMessage } from './entryMessages';
import { useExpenseEntry, usePendingExpenses } from './entryProvider';
import { requestPreview, useDenyExpenseOptions, useExpenseOptions } from './entryQueries';
import { addDays, isCalendarDate } from './input';
import { PendingSection } from './PendingSection';
import {
  currentPreview,
  initialPreview,
  isPreviewing,
  isStalePreview,
  previewFailure,
  previewReducer,
} from './previewState';
import { categoryLabel, memberName } from './rows';
import { SavedExpense } from './SavedExpense';

type Saved = Extract<EntryOutcome, { kind: 'saved' }>;
type Banner = 'rejected' | 'not-sent' | null;

/**
 * Add a TWD expense split equally between chosen members: fill in, preview the backend's split,
 * confirm. Confirming freezes the request on the device before anything is sent; the entry engine
 * owns it from there, so closing this screen never loses or cancels it.
 */
export function NewExpenseScreen({ tripId }: { tripId: string }) {
  const t = useMessages();
  const online = useOnline();
  const options = useExpenseOptions(tripId);
  const denyOptions = useDenyExpenseOptions(tripId);
  const pending = usePendingExpenses(tripId);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [reasons, setReasons] = useState<Record<string, UnconfirmedReason>>({});
  const records = pending.data ?? [];
  // Never leave a previously cached member payload visible after access is denied.
  const denied = isAccessDenied(options.error);
  // Unconfirmed requests replace the form, but not while this screen is still sending one itself.
  const showPending = !saved && !submitting && records.length > 0;
  // Rereads the device list before the form gives way, so it never flashes back as idle.
  const setBusy = async (busy: boolean) => {
    if (!busy) await pending.refetch();
    setSubmitting(busy);
  };

  const body = (() => {
    if (saved) {
      return <SavedExpense saved={saved} tripId={tripId} onAnother={() => setSaved(null)} />;
    }
    if (pending.isError) {
      // Without the device database nothing can be saved first, so nothing may be sent.
      return (
        <>
          <Notice>{t.entryNotSent}</Notice>
          <Action
            testID="new-expense-retry"
            label={t.retry}
            onPress={() => void pending.refetch()}
          />
        </>
      );
    }
    if (pending.isPending) return null;
    // Unconfirmed requests come from the device, so they are shown (and can be looked up) even
    // when the member options cannot be loaded, for instance after losing access to the trip.
    if (showPending) {
      return (
        <PendingSection
          records={records}
          reasons={reasons}
          onSaved={setSaved}
          onReason={(id, reason) => setReasons((all) => ({ ...all, [id]: reason }))}
          onSettled={(outcome) => {
            if (outcome.kind === 'rejected') setBanner('rejected');
            void pending.refetch();
          }}
        />
      );
    }
    if (denied) return <Notice>{t.notFound}</Notice>;
    if (options.isPending) {
      return online ? <ActivityIndicator accessibilityLabel={t.loading} /> : null;
    }
    if (!options.data) {
      return (
        <>
          <Notice>{errorMessage(options.error, t)}</Notice>
          <Action
            testID="new-expense-retry"
            label={t.retry}
            disabled={!online || options.isFetching}
            onPress={() => void options.refetch()}
          />
        </>
      );
    }
    return (
      <EntryForm
        tripId={tripId}
        options={options.data}
        onSubmitting={setBusy}
        onSaved={setSaved}
        onBanner={setBanner}
        onUnconfirmed={(id, reason) => setReasons((all) => ({ ...all, [id]: reason }))}
        onDenied={(error) => {
          // The preview learned first. Recording it as the options' error hides the form now and
          // keeps it hidden through later failures; rereading them confirms it with the server.
          denyOptions(error);
          void options.refetch();
        }}
      />
    );
  })();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* A new view starts at the top instead of keeping the previous view's scroll position. */}
      <Page key={saved ? 'saved' : showPending ? 'pending' : 'form'} form>
        <Action
          testID="new-expense-back"
          secondary
          label={t.backShort}
          onPress={() => goBack({ pathname: '/trips/[id]/expenses', params: { id: tripId } })}
        />
        {!saved && !showPending && (
          <>
            <Title>{t.addExpense}</Title>
            <Copy>{t.newExpenseHint}</Copy>
          </>
        )}
        {!online && !saved && <Notice>{t.offlineEntry}</Notice>}
        {banner === 'rejected' && !saved && <Notice>{t.entryRejected}</Notice>}
        {banner === 'not-sent' && !saved && <Notice>{t.entryNotSent}</Notice>}
        {body}
      </Page>
    </KeyboardAvoidingView>
  );
}

function EntryForm({
  tripId,
  options,
  onSubmitting,
  onSaved,
  onBanner,
  onUnconfirmed,
  onDenied,
}: {
  tripId: string;
  options: ExpenseOptions;
  onSubmitting: (submitting: boolean) => void | Promise<void>;
  onSaved: (saved: Saved) => void;
  onBanner: (banner: Banner) => void;
  onUnconfirmed: (clientRequestId: string, reason: UnconfirmedReason) => void;
  /** The trip can no longer be read: the form, its members and any split must go. */
  onDenied: (error: unknown) => void;
}) {
  const t = useMessages();
  const p = usePalette();
  const online = useOnline();
  const { user } = useAuth();
  const { entry, scope, manager } = useExpenseEntry();
  const [draft, setDraft] = useState<ExpenseDraft>(() => newDraft(options, user?.id, localDate()));
  const [attempted, setAttempted] = useState(false);
  const [previews, dispatch] = useReducer(previewReducer, initialPreview);
  const [submitting, setSubmitting] = useState(false);
  const tickets = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const amountInput = useRef<TextInput>(null);
  // Reopened forms must attach their own accessory rather than reuse a recycled native view's ID.
  const amountAccessoryId = `new-expense-amount-${useId()}`;

  const issues = validateDraft(draft, options);
  const request = previewInputOf(draft, options);
  const key = request ? previewKey(request) : null;
  // A preview counts only while the amount and members still match what it was computed for.
  const current = currentPreview(previews, key);
  const stale = isStalePreview(previews, key);
  const previewing = isPreviewing(previews, key);
  const previewError = previewFailure(previews, key);
  const edit = (patch: Partial<ExpenseDraft>) => setDraft((all) => ({ ...all, ...patch }));
  // Any change to the amount or members throws the preview away and cancels a request in flight.
  const reset = () => {
    inFlight.current?.abort();
    inFlight.current = null;
    dispatch({ type: 'clear', ticket: ++tickets.current });
  };
  const message = (field: DraftIssue['field']) => {
    const found = attempted ? issues.find((entryIssue) => entryIssue.field === field) : undefined;
    return found ? issueMessage(found, t) : undefined;
  };
  const mine = (id: string) => (id === user?.id ? ` · ${t.you}` : '');

  useEffect(() => () => inFlight.current?.abort(), []);

  const runPreview = async () => {
    setAttempted(true);
    onBanner(null);
    if (!request || !scope || issues.length > 0 || submitting) return;
    inFlight.current?.abort();
    const controller = (inFlight.current = new AbortController());
    const ticket = ++tickets.current;
    const requestKey = previewKey(request);
    dispatch({ type: 'start', ticket, key: requestKey });
    try {
      const value = await requestPreview(
        manager,
        scope.accountId,
        tripId,
        request,
        controller.signal
      );
      dispatch({ type: 'resolve', ticket, key: requestKey, value });
    } catch (error) {
      if (controller.signal.aborted) {
        dispatch({ type: 'abandon', ticket });
        return;
      }
      dispatch({ type: 'reject', ticket, key: requestKey, error });
      if (isAccessDenied(error)) onDenied(error);
    }
  };

  const confirm = async () => {
    if (sending.current || !current || !scope) return;
    sending.current = true;
    setSubmitting(true);
    onSubmitting(true);
    onBanner(null);
    try {
      const outcome = await entry.submit(scope, tripId, confirmedFields(draft, options, current));
      if (outcome.kind === 'saved') onSaved(outcome);
      else if (outcome.kind === 'unconfirmed')
        onUnconfirmed(outcome.clientRequestId, outcome.reason);
      else if (outcome.kind === 'rejected') {
        dispatch({ type: 'clear', ticket: ++tickets.current });
        onBanner('rejected');
      } else if (outcome.kind === 'not-sent') onBanner('not-sent');
    } catch {
      // The preview no longer matches the draft; nothing was saved or sent.
      dispatch({ type: 'clear', ticket: ++tickets.current });
    } finally {
      sending.current = false;
      setSubmitting(false);
      await onSubmitting(false);
    }
  };

  const toggle = (id: string) => {
    reset();
    edit({
      memberIds: draft.memberIds.includes(id)
        ? draft.memberIds.filter((memberId) => memberId !== id)
        : [...draft.memberIds, id],
    });
  };
  const shift = (days: number) =>
    edit({ date: addDays(isCalendarDate(draft.date) ? draft.date : localDate(), days) });
  const locked = submitting;

  return (
    <>
      <TextField
        testID="new-expense-description"
        label={t.expenseDescription}
        value={draft.description}
        onChangeText={(description) => edit({ description })}
        editable={!locked}
        returnKeyType="next"
        onSubmitEditing={() => amountInput.current?.focus()}
        error={message('description')}
      />
      <TextField
        testID="new-expense-amount"
        inputRef={amountInput}
        label={t.amountTwd}
        placeholder={t.amountHint}
        value={draft.amountText}
        onChangeText={(amountText) => {
          reset();
          edit({ amountText });
        }}
        editable={!locked}
        keyboardType="decimal-pad"
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
        inputAccessoryViewID={amountAccessoryId}
        autoCorrect={false}
        error={message('amount')}
      />
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={amountAccessoryId}>
          <View
            style={{
              alignItems: 'flex-end',
              padding: 8,
              backgroundColor: p.surface,
              borderTopWidth: 1,
              borderColor: p.border,
            }}
          >
            <Pressable
              testID="new-expense-keyboard-done"
              accessibilityRole="button"
              accessibilityLabel={t.done}
              onPress={Keyboard.dismiss}
              hitSlop={8}
              style={{ paddingVertical: 8, paddingHorizontal: 16 }}
            >
              <Text style={{ color: p.primary, fontSize: 17, fontWeight: '600' }}>{t.done}</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
      <TextField
        testID="new-expense-date"
        label={t.date}
        placeholder={t.dateFormatHint}
        value={draft.date}
        onChangeText={(date) => edit({ date })}
        editable={!locked}
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={10}
        error={message('date')}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip
          testID="new-expense-date-prev"
          role="button"
          label={t.previousDay}
          disabled={locked}
          onPress={() => shift(-1)}
        />
        <Chip
          testID="new-expense-date-today"
          role="button"
          label={t.today}
          disabled={locked}
          onPress={() => edit({ date: localDate() })}
        />
        <Chip
          testID="new-expense-date-next"
          role="button"
          label={t.nextDay}
          disabled={locked}
          onPress={() => shift(1)}
        />
      </View>
      <Section title={t.category}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.categories.map((category) => (
            <Chip
              key={category}
              testID={`new-expense-category-${category}`}
              label={categoryLabel(category, t)}
              selected={draft.category === category}
              disabled={locked}
              onPress={() => edit({ category })}
            />
          ))}
        </View>
      </Section>
      <Section title={t.paidBy}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.members.map((member) => (
            <Chip
              key={member.id}
              testID={`new-expense-payer-${member.id}`}
              label={`${memberName(member.displayName, t)}${mine(member.id)}`}
              selected={draft.payerId === member.id}
              disabled={locked}
              onPress={() => edit({ payerId: member.id })}
            />
          ))}
        </View>
        {!!message('payer') && <FieldError message={message('payer')!} />}
      </Section>
      <Section title={t.splitMembers}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.members.map((member) => (
            <Chip
              key={member.id}
              testID={`new-expense-member-${member.id}`}
              role="checkbox"
              label={`${memberName(member.displayName, t)}${mine(member.id)}`}
              selected={draft.memberIds.includes(member.id)}
              disabled={locked}
              onPress={() => toggle(member.id)}
            />
          ))}
        </View>
        {!!message('members') && <FieldError message={message('members')!} />}
      </Section>

      <Action
        testID="new-expense-preview"
        secondary
        label={previewing ? t.previewing : t.previewSplit}
        busy={previewing}
        disabled={!online || locked}
        onPress={() => void runPreview()}
      />
      {!!previewError && <Notice>{errorMessage(previewError, t)}</Notice>}
      {stale && <Notice>{t.previewStale}</Notice>}
      {current && (
        <Section title={t.previewTitle}>
          <Copy>{t.previewHint}</Copy>
          <Card testID="new-expense-preview-card">
            <DetailRow
              testID="new-expense-preview-total"
              label={t.amountTwd}
              value={money(current.amount)}
            />
            {current.splits.map((split, index) => (
              <DetailRow
                key={split.userId}
                testID={`new-expense-split-${index}`}
                label={`${memberName(split.displayName, t)}${mine(split.userId)}`}
                value={money(split.shareAmount)}
              />
            ))}
          </Card>
        </Section>
      )}
      {!current && !stale && <Copy>{t.previewNeeded}</Copy>}
      <Action
        testID="new-expense-confirm"
        label={submitting ? t.saving : t.confirmSave}
        busy={submitting}
        disabled={!current || !online}
        onPress={() => void confirm()}
      />
    </>
  );
}

function FieldError({ message }: { message: string }) {
  const p = usePalette();
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ color: p.danger, fontSize: 16, lineHeight: 25 }}
    >
      {message}
    </Text>
  );
}
