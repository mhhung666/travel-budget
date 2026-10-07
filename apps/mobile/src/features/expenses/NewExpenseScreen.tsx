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
import { router } from 'expo-router';
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
  previewInputOf,
  previewKey,
  validateDraft,
  type DraftIssue,
  type ExpenseDraft,
} from './draft';
import type { EntryOutcome, UnconfirmedReason } from './entry';
import { issueMessage } from './entryMessages';
import { useExpenseEntry, usePendingExpenses, useExpenseQueue } from './entryProvider';
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
import { useExpenseDraft } from './useExpenseDraft';
import type { DraftEditor } from './draftEditor';
import type { PendingScope } from '@/storage/pendingExpenses';

type Saved = Extract<EntryOutcome, { kind: 'saved' }>;
type Banner = 'rejected' | 'not-sent' | null;

/**
 * Add a TWD expense split equally between chosen members: fill in, preview the backend's split,
 * confirm. Confirming freezes the request on the device before anything is sent; the entry engine
 * owns it from there, so closing this screen never loses or cancels it.
 */
export function NewExpenseScreen({ tripId }: { tripId: string }) {
  const { scope } = useExpenseEntry();
  return (
    <ScopedNewExpenseScreen
      key={JSON.stringify([scope?.environment, scope?.accountId, tripId])}
      tripId={tripId}
    />
  );
}

function ScopedNewExpenseScreen({ tripId }: { tripId: string }) {
  const t = useMessages();
  const online = useOnline();
  const options = useExpenseOptions(tripId);
  const denyOptions = useDenyExpenseOptions(tripId);
  const pending = usePendingExpenses(tripId);
  const { scope } = useExpenseEntry();
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
          <Notice tone="danger">{t.entryNotSent}</Notice>
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
    if (denied) return <Notice tone="danger">{t.notFound}</Notice>;
    if (options.isPending) {
      return online ? <ActivityIndicator accessibilityLabel={t.loading} /> : null;
    }
    if (!options.data || !options.authorized) {
      return (
        <>
          {options.isFetching ? (
            <ActivityIndicator accessibilityLabel={t.loading} />
          ) : (
            <Notice tone="danger">{errorMessage(options.error, t)}</Notice>
          )}
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
      <DraftForm
        key={`${scope?.environment}/${scope?.accountId}/${tripId}`}
        scope={scope!}
        tripId={tripId}
        options={options.data}
        refreshOptions={async () => {
          const result = await options.refetch({ throwOnError: true });
          if (!result.data) throw new Error('OPTIONS_UNAVAILABLE');
          return result.data;
        }}
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
        {!online && !saved && <Notice tone="warning">{t.offlineEntry}</Notice>}
        {!online && !saved && !denied && (
          <Action
            secondary
            label={t.localDrafts}
            onPress={() => router.replace({ pathname: '/drafts/[id]', params: { id: tripId } })}
          />
        )}
        {banner === 'rejected' && !saved && <Notice tone="danger">{t.entryRejected}</Notice>}
        {banner === 'not-sent' && !saved && <Notice tone="danger">{t.entryNotSent}</Notice>}
        {body}
      </Page>
    </KeyboardAvoidingView>
  );
}

type FormProps = {
  tripId: string;
  localOnly?: boolean;
  options: ExpenseOptions;
  refreshOptions: () => Promise<ExpenseOptions>;
  onSubmitting: (submitting: boolean) => void | Promise<void>;
  onSaved: (saved: Saved) => void;
  onBanner: (banner: Banner) => void;
  onUnconfirmed: (clientRequestId: string, reason: UnconfirmedReason) => void;
  onDenied: (error: unknown) => void;
};

/** Reuses the raw-input editor, with all preview/submit paths disabled in local mode. */
export function LocalDraftForm({
  scope,
  tripId,
  options,
}: {
  scope: PendingScope;
  tripId: string;
  options: ExpenseOptions;
}) {
  return (
    <DraftForm
      scope={scope}
      tripId={tripId}
      options={options}
      localOnly
      refreshOptions={() => Promise.reject(new Error('LOCAL_ONLY'))}
      onSubmitting={() => {}}
      onSaved={() => {}}
      onBanner={() => {}}
      onUnconfirmed={() => {}}
      onDenied={() => {}}
    />
  );
}

function DraftForm(props: FormProps & { scope: PendingScope }) {
  const t = useMessages();
  const { editor, state } = useExpenseDraft(props.scope, props.tripId, props.options);
  if (state.phase === 'loading') return <ActivityIndicator accessibilityLabel={t.loading} />;
  if (state.phase === 'error')
    return (
      <>
        <Notice tone="danger">{t.draftLoadFailed}</Notice>
        <Action
          label={t.retry}
          testID="draft-load-retry"
          onPress={() => void editor.initialize()}
        />
      </>
    );
  if (state.phase === 'choice')
    return (
      <>
        <Title>{t.draftFound}</Title>
        <Copy>{t.draftResumeHint}</Copy>
        {state.discardFailed && <Notice tone="danger">{t.draftDiscardFailed}</Notice>}
        <Action label={t.draftRestore} testID="draft-restore" onPress={editor.restore} />
        <Action
          secondary
          label={t.draftDiscard}
          testID="draft-discard"
          onPress={() => void editor.discard()}
        />
      </>
    );
  return (
    <>
      <Copy>{t.draftHint}</Copy>
      <View testID="draft-save-status">
        <Notice
          tone={state.status === 'failed' ? 'danger' : 'info'}
          role={state.status === 'failed' ? 'alert' : 'status'}
          announce={state.status === 'failed' ? 'polite' : 'none'}
        >
          {state.status === 'saving'
            ? t.draftSaving
            : state.status === 'saved'
              ? t.draftSaved
              : t.draftSaveFailed}
        </Notice>
      </View>
      {state.status === 'failed' && (
        <Action
          secondary
          label={t.retry}
          testID="draft-save-retry"
          onPress={() => void editor.flush().catch(() => undefined)}
        />
      )}
      {state.discardFailed && <Notice tone="danger">{t.draftDiscardFailed}</Notice>}
      <EntryForm {...props} editor={editor} draft={state.record!.input} saveStatus={state.status} />
    </>
  );
}

function EntryForm({
  tripId,
  localOnly = false,
  options,
  refreshOptions,
  onSubmitting,
  onSaved,
  onBanner,
  onUnconfirmed,
  onDenied,
  editor,
  draft,
  saveStatus,
}: FormProps & {
  editor: DraftEditor;
  draft: ExpenseDraft;
  saveStatus: 'saving' | 'saved' | 'failed';
}) {
  const t = useMessages();
  const p = usePalette();
  const online = useOnline();
  const { user } = useAuth();
  const { entry, scope, manager } = useExpenseEntry();
  const { queue } = useExpenseQueue();
  const [queueError, setQueueError] = useState(false);
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
  const edit = (patch: Partial<ExpenseDraft>) => {
    reset();
    editor.edit({ ...editor.getSnapshot().record!.input, ...patch });
  };
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
  useEffect(() => {
    // Reconnection must never unlock a preview made before the connection was lost.
    if (!online || localOnly) {
      inFlight.current?.abort();
      inFlight.current = null;
      dispatch({ type: 'clear', ticket: ++tickets.current });
    }
  }, [online, localOnly]);

  const runPreview = async () => {
    setAttempted(true);
    onBanner(null);
    if (
      localOnly ||
      manager.getSnapshot().status !== 'signedIn' ||
      !online ||
      !request ||
      !scope ||
      issues.length > 0 ||
      submitting
    )
      return;
    inFlight.current?.abort();
    const controller = (inFlight.current = new AbortController());
    const ticket = ++tickets.current;
    let requestKey = previewKey(request);
    dispatch({ type: 'start', ticket, key: requestKey });
    try {
      // Always recheck authorization, members and categories before producing a new preview.
      const revision = editor.getSnapshot().record?.revision;
      const fresh = await refreshOptions();
      if (controller.signal.aborted || revision !== editor.getSnapshot().record?.revision) return;
      const freshInput = previewInputOf(draft, fresh);
      if (!freshInput || validateDraft(draft, fresh).length > 0) {
        dispatch({ type: 'abandon', ticket });
        return;
      }
      requestKey = previewKey(freshInput);
      dispatch({ type: 'start', ticket, key: requestKey });
      const value = await requestPreview(
        manager,
        scope.accountId,
        tripId,
        freshInput,
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

  const enqueue = async () => {
    setAttempted(true);
    if (sending.current || !scope || issues.length || saveStatus !== 'saved') return;
    const identity = manager.getSnapshot();
    if (!['signedIn', 'local'].includes(identity.status) || identity.user?.id !== scope.accountId)
      return;
    sending.current = true;
    setSubmitting(true);
    setQueueError(false);
    reset();
    try {
      const stored = await editor.flush();
      await queue.enqueue(stored, options);
      // The queue owns this source now. A new draft starts only when the user returns.
      editor.close();
      router.replace('/queue');
    } catch {
      setQueueError(true);
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  };

  const confirm = async () => {
    if (
      localOnly ||
      manager.getSnapshot().status !== 'signedIn' ||
      !online ||
      sending.current ||
      !current ||
      !scope
    )
      return;
    sending.current = true;
    setSubmitting(true);
    onSubmitting(true);
    onBanner(null);
    try {
      const stored = await editor.flush();
      const outcome = await entry.submit(
        scope,
        tripId,
        confirmedFields(stored.input, options, current),
        stored
      );
      if (outcome.kind === 'saved' || outcome.kind === 'unconfirmed' || outcome.kind === 'blocked')
        editor.close();
      if (outcome.kind === 'saved') onSaved(outcome);
      else if (outcome.kind === 'unconfirmed')
        onUnconfirmed(outcome.clientRequestId, outcome.reason);
      else if (outcome.kind === 'rejected') {
        dispatch({ type: 'clear', ticket: ++tickets.current });
        onBanner('rejected');
        await editor.initialize(true);
      } else if (outcome.kind === 'not-sent') onBanner('not-sent');
    } catch {
      // Nothing was sent when local persistence or draft/preview validation failed.
      onBanner('not-sent');
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
  const missingMembers = draft.memberIds.filter(
    (id) => !options.members.some((member) => member.id === id)
  );

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
        {!!message('category') && <FieldError message={message('category')!} />}
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
        {missingMembers.length > 0 && (
          <>
            <Notice tone="warning">{t.draftMembersChanged}</Notice>
            <Action
              secondary
              label={t.draftRemoveMembers}
              testID="draft-remove-members"
              disabled={locked}
              onPress={() =>
                edit({ memberIds: draft.memberIds.filter((id) => !missingMembers.includes(id)) })
              }
            />
          </>
        )}
        {!!message('members') && <FieldError message={message('members')!} />}
      </Section>

      <Action
        testID="new-expense-preview"
        secondary
        label={previewing ? t.previewing : t.previewSplit}
        busy={previewing}
        disabled={localOnly || !online || locked}
        onPress={() => void runPreview()}
      />
      {!!previewError && <Notice tone="danger">{errorMessage(previewError, t)}</Notice>}
      {stale && <Notice tone="warning">{t.previewStale}</Notice>}
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
        disabled={
          localOnly || !current || !online || locked || saveStatus !== 'saved' || issues.length > 0
        }
        onPress={() => void confirm()}
      />
      <Notice>{t.queueRule}</Notice>
      {!!queueError && <Notice tone="danger">{t.entryNotSent}</Notice>}
      <Action
        testID="expense-queue-confirm"
        label={t.queueConfirm}
        busy={submitting}
        disabled={locked || saveStatus !== 'saved'}
        onPress={() => void enqueue()}
      />
      <Action
        secondary
        label={t.draftDiscard}
        testID="draft-discard"
        disabled={locked}
        onPress={() => {
          reset();
          void editor.discard();
        }}
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
