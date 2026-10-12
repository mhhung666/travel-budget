import { goBack } from '@/components/navigation';
import { FormPage } from '@/components/screen';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Keyboard, TextInput } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useQuery } from '@tanstack/react-query';
import { ledgerCapabilitiesSchema, tripFieldsSchema } from '@/api/contracts';
import { Action, Copy, DetailRow, Notice, TextField } from '@/components/ui';
import { useAppLocale, useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiError } from '@/api/client';
import { currencyMessages } from '@/i18n/currencyMessages';
import { errorMessage } from '@/features/auth/errorMessage';
import { useTripEntry } from './provider';
import { parseInvitation } from './input';
import { BaseCurrencyField } from './BaseCurrencyField';
import { baseCurrencyCodes } from './currencySelection';

export function TripFormScreen({ mode }: { mode: 'create' | 'join' }) {
  const { manager, user, status } = useAuth();
  if (status !== 'signedIn' || !user) return null;
  return (
    <TripForm
      key={JSON.stringify([manager.api.environment, user.id, manager.getSignInVersion(), mode])}
      mode={mode}
    />
  );
}
function TripForm({ mode }: { mode: 'create' | 'join' }) {
  const t = useMessages();
  const online = useOnline();
  const { entry, scope, records, manager } = useTripEntry();
  const copy = currencyMessages[useAppLocale()];
  const navigation = useNavigation();
  const [fields, setFields] = useState({ name: '', description: '', start_date: '', end_date: '' });
  const [base, setBase] = useState('TWD');
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [owner] = useState(() => ({
    environment: scope?.environment,
    accountId: scope?.accountId,
    version: manager.getSignInVersion(),
  }));
  const sameOwner =
    !!scope &&
    owner.environment === manager.api.environment &&
    owner.accountId === scope.accountId &&
    manager.getSignInVersion() === owner.version &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === scope.accountId &&
    owner.environment === scope.environment;
  const current = () =>
    mounted.current &&
    sameOwner &&
    manager.getSignInVersion() === owner.version &&
    manager.getSnapshot().status === 'signedIn' &&
    manager.getSnapshot().user?.id === owner.accountId &&
    manager.api.environment === owner.environment;
  const capabilities = useQuery({
    queryKey: [
      manager.api.environment,
      scope?.accountId,
      'ledger-capabilities',
      'v2',
      owner.version,
    ],
    enabled: mode === 'create' && sameOwner && online,
    queryFn: async ({ signal }) => {
      const check = () => {
        if (!current()) throw new ApiError('CANCELLED');
      };
      check();
      const result = await manager.requestAs(
        scope!.accountId,
        '/capabilities',
        ledgerCapabilitiesSchema,
        { signal, beforeSend: check }
      );
      check();
      return result;
    },
  });
  const baseCodes = baseCurrencyCodes(capabilities.data);
  const pendingRecord = records.data?.find(
    (record) =>
      record.status === 'pending' &&
      record.operation === (mode === 'create' ? 'trip.create' : 'trip.join')
  );
  const pending = !!pendingRecord;
  const original =
    pendingRecord?.payload?.operation === 'trip.create' ? pendingRecord.payload.body : null;
  const displayFields = original
    ? {
        name: original.name,
        description: original.description,
        start_date: original.start_date ?? '',
        end_date: original.end_date ?? '',
      }
    : fields;
  const displayBase =
    original && 'base_currency' in original && typeof original.base_currency === 'string'
      ? original.base_currency
      : (pendingRecord?.baseCurrency ?? base);
  const displayInvite =
    pendingRecord?.payload?.operation === 'trip.join'
      ? pendingRecord.payload.body.invite_code
      : invite;
  const recordsReady =
    !!records.data && !records.isPending && !records.isError && !records.isFetching;
  const capabilityReady =
    !!capabilities.data &&
    !capabilities.isPending &&
    !capabilities.isError &&
    !capabilities.isFetching &&
    baseCodes.includes(base);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [notSent, setNotSent] = useState(false);
  const first = useRef<TextInput>(null);
  const description = useRef<TextInput>(null);
  const start = useRef<TextInput>(null);
  const end = useRef<TextInput>(null);
  const frozen = busy || confirmed || pending;
  const canSubmit =
    sameOwner &&
    online &&
    !frozen &&
    !currencyOpen &&
    recordsReady &&
    (mode !== 'create' || capabilityReady);
  const latest = useRef({ canSubmit, frozen, baseCodes, currencyOpen });
  useLayoutEffect(() => {
    latest.current = { canSubmit, frozen, baseCodes, currencyOpen };
  });
  const dirty = mode === 'join' ? !!invite : base !== 'TWD' || Object.values(fields).some(Boolean);
  usePreventRemove(
    sameOwner && (busy || currencyOpen || (dirty && !confirmed && !pending)),
    ({ data }) => {
      if (!current() || inFlight.current || busy) return;
      if (latest.current.currencyOpen) {
        Keyboard.dismiss();
        setCurrencyOpen(false);
        return;
      }
      Alert.alert(t.leaveFormTitle, t.unsavedTrip, [
        { text: t.stayForm, style: 'cancel' },
        {
          text: t.leaveForm,
          style: 'destructive',
          onPress: () => {
            if (current() && !inFlight.current) navigation.dispatch(data.action);
          },
        },
      ]);
    }
  );
  const submit = async () => {
    if (!scope || !current() || !latest.current.canSubmit || inFlight.current) return;
    let payload: Parameters<typeof entry.confirm>[1];
    if (mode === 'create') {
      const parsed = tripFieldsSchema.safeParse({
        ...fields,
        start_date: fields.start_date || null,
        end_date: fields.end_date || null,
      });
      if (!parsed.success) {
        setError(t.invalidTrip);
        const field = parsed.error.issues[0]?.path[0];
        (field === 'description'
          ? description
          : field === 'start_date'
            ? start
            : field === 'end_date'
              ? end
              : first
        ).current?.focus();
        return;
      }
      payload = { operation: 'trip.create', body: { ...parsed.data, base_currency: base } };
    } else {
      const code = parseInvitation(invite, scope.environment, process.env.EXPO_PUBLIC_WEB_ORIGIN);
      if (!code) {
        setError(t.invalidInvite);
        first.current?.focus();
        return;
      }
      payload = { operation: 'trip.join', body: { invite_code: code } };
    }
    const signInVersion = manager.getSignInVersion();
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotSent(false);
    try {
      const outcome = await entry.confirm(scope, payload);
      if (!current() || manager.getSignInVersion() !== signInVersion) return;
      if (outcome.kind === 'not-sent') {
        setNotSent(true);
        setError(errorMessage(outcome.error, t));
      } else if (outcome.kind === 'blocked') setError(t.operationBlocked);
      else {
        latest.current = { ...latest.current, frozen: true, canSubmit: false };
        setConfirmed(true);
        // Give React the confirmed state before dispatching past the unsaved-input guard.
        setTimeout(() => {
          if (!current() || !navigation.isFocused() || manager.getSignInVersion() !== signInVersion)
            return;
          if (outcome.kind === 'completed' && outcome.result.status === 'committed')
            router.dismissTo({
              pathname: '/trips/[id]',
              params: { id: outcome.result.resourceId },
            });
          else router.replace('/trips/operations');
        }, 0);
      }
    } catch (failure) {
      if (current() && navigation.isFocused()) setError(errorMessage(failure, t));
    } finally {
      if (current()) setBusy(false);
      inFlight.current = false;
    }
  };
  const edit = (key: keyof typeof fields, value: string) => {
    if (current() && !inFlight.current && !latest.current.frozen)
      setFields((old) => ({ ...old, [key]: value }));
  };
  return (
    <FormPage
      title={mode === 'create' ? t.createTrip : t.joinTrip}
      backLabel={t.back}
      backTestID="trip-form-back"
      busy={busy}
      onBack={() => {
        if (!inFlight.current) goBack('/trips');
      }}
    >
      <Copy>{mode === 'create' ? t.tripFormHint : t.inviteHint}</Copy>
      {mode === 'create' ? (
        <>
          <TextField
            inputRef={first}
            testID="trip-name"
            label={t.tripName}
            value={displayFields.name}
            editable={!frozen}
            onChangeText={(value) => edit('name', value)}
            maxLength={100}
            returnKeyType="next"
            onSubmitEditing={() => description.current?.focus()}
          />
          <BaseCurrencyField
            value={displayBase}
            codes={baseCodes}
            disabled={frozen || !capabilities.data}
            open={currencyOpen}
            onOpenChange={(open) => {
              if (current() && (!open || (!inFlight.current && !latest.current.frozen)))
                setCurrencyOpen(open);
            }}
            onChange={(code) => {
              if (
                current() &&
                !inFlight.current &&
                !latest.current.frozen &&
                latest.current.baseCodes.includes(code)
              )
                setBase(code);
            }}
          />
          {!pending && !confirmed && (
            <>
              {online && capabilities.isPending && !capabilities.data && (
                <Copy>{copy.loading}</Copy>
              )}
              {online && capabilities.isFetching && !!capabilities.data && (
                <Copy>{copy.checking}</Copy>
              )}
              {capabilities.isError && <Notice tone="warning">{t.ledgerUnavailable}</Notice>}
              {!!capabilities.data &&
                !capabilities.isFetching &&
                !capabilities.isError &&
                !baseCodes.includes(base) && (
                  <Notice tone="warning">
                    {baseCodes.length ? copy.notAllowed : copy.noneAvailable}
                  </Notice>
                )}
              {(capabilities.isError || (!!capabilities.data && !baseCodes.length)) && (
                <Action
                  testID="trip-currency-retry"
                  variant="secondary"
                  label={t.retry}
                  disabled={!online || busy}
                  busy={capabilities.isFetching}
                  onPress={() => {
                    if (current() && online && !inFlight.current) void capabilities.refetch();
                  }}
                />
              )}
            </>
          )}
          <TextField
            inputRef={description}
            testID="trip-description"
            label={t.tripDescription}
            value={displayFields.description}
            editable={!frozen}
            onChangeText={(value) => edit('description', value)}
            multiline
            submitBehavior="submit"
            returnKeyType="next"
            onSubmitEditing={() => start.current?.focus()}
            maxLength={2000}
          />
          <TextField
            inputRef={start}
            testID="trip-start"
            label={t.startDate}
            value={displayFields.start_date}
            editable={!frozen}
            onChangeText={(value) => edit('start_date', value)}
            returnKeyType="next"
            onSubmitEditing={() => end.current?.focus()}
            placeholder={t.dateFormatHint}
            autoCapitalize="none"
            maxLength={10}
          />
          <TextField
            inputRef={end}
            testID="trip-end"
            label={t.endDate}
            value={displayFields.end_date}
            editable={!frozen}
            onChangeText={(value) => edit('end_date', value)}
            placeholder={t.dateFormatHint}
            autoCapitalize="none"
            maxLength={10}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </>
      ) : (
        <TextField
          inputRef={first}
          testID="trip-invite"
          label={t.inviteInput}
          value={displayInvite}
          editable={!frozen}
          onChangeText={(value) => {
            if (current() && !inFlight.current && !latest.current.frozen) setInvite(value);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
      )}
      {notSent && <Notice tone="danger">{t.operationNotSent}</Notice>}
      {!!error && <Notice tone="danger">{error}</Notice>}
      {records.isPending && <Copy>{mode === 'create' ? copy.readingConfirmation : t.loading}</Copy>}
      {records.isError && (
        <>
          <Notice tone="warning">{copy.preparationFailed}</Notice>
          <Action
            testID="trip-records-retry"
            variant="secondary"
            label={t.retry}
            busy={records.isFetching}
            onPress={() => {
              if (current() && !inFlight.current) void records.refetch();
            }}
          />
        </>
      )}
      {pendingRecord && (
        <>
          <Notice tone="warning">{t.operationUnknown}</Notice>
          <DetailRow label={t.requestId} value={pendingRecord.clientRequestId} />
        </>
      )}
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      <Action
        testID="trip-confirm"
        label={mode === 'create' ? t.createTrip : t.joinTrip}
        busy={busy}
        disabled={!canSubmit}
        onPress={() => void submit()}
      />
      <Action
        variant="ghost"
        label={t.pendingOperations}
        disabled={busy}
        onPress={() => {
          if (current() && !inFlight.current) router.push('/trips/operations');
        }}
      />
    </FormPage>
  );
}
