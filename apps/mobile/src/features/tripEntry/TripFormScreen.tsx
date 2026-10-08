import { goBack } from '@/components/navigation';
import { FormPage } from '@/components/screen';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, TextInput } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useQuery } from '@tanstack/react-query';
import { ledgerCapabilitiesSchema, tripFieldsSchema } from '@/api/contracts';
import { Action, Chip, Copy, Notice, TextField } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { errorMessage } from '@/features/auth/errorMessage';
import { useTripEntry } from './provider';
import { parseInvitation } from './input';

export function TripFormScreen({ mode }: { mode: 'create' | 'join' }) {
  const t = useMessages();
  const online = useOnline();
  const { entry, scope, manager } = useTripEntry();
  const navigation = useNavigation();
  const [fields, setFields] = useState({ name: '', description: '', start_date: '', end_date: '' });
  const [base, setBase] = useState('TWD');
  const [baseSearch, setBaseSearch] = useState('');
  const capabilities = useQuery({
    queryKey: [manager.api.environment, scope?.accountId, 'ledger-capabilities', 'v2'],
    enabled: mode === 'create' && !!scope && online,
    queryFn: () => manager.request('/capabilities', ledgerCapabilitiesSchema),
  });
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
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [notSent, setNotSent] = useState(false);
  const first = useRef<TextInput>(null);
  const description = useRef<TextInput>(null);
  const start = useRef<TextInput>(null);
  const end = useRef<TextInput>(null);
  const dirty = mode === 'join' ? !!invite : Object.values(fields).some(Boolean);
  usePreventRemove(dirty && !confirmed && !busy, ({ data }) =>
    Alert.alert(t.leaveFormTitle, t.unsavedTrip, [
      { text: t.stayForm, style: 'cancel' },
      { text: t.leaveForm, style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  );
  const submit = async () => {
    if (!scope || inFlight.current) return;
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
      if (
        !mounted.current ||
        !navigation.isFocused() ||
        manager.getSignInVersion() !== signInVersion
      )
        return;
      if (outcome.kind === 'not-sent') {
        setNotSent(true);
        setError(errorMessage(outcome.error, t));
      } else if (outcome.kind === 'blocked') setError(t.operationBlocked);
      else {
        setConfirmed(true);
        // Give React the confirmed state before dispatching past the unsaved-input guard.
        setTimeout(() => {
          if (
            !mounted.current ||
            !navigation.isFocused() ||
            manager.getSignInVersion() !== signInVersion
          )
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
      setError(errorMessage(failure, t));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };
  const edit = (key: keyof typeof fields, value: string) =>
    setFields((old) => ({ ...old, [key]: value }));
  return (
    <FormPage
      title={mode === 'create' ? t.createTrip : t.joinTrip}
      backLabel={t.back}
      backTestID="trip-form-back"
      busy={busy}
      onBack={() => goBack('/trips')}
    >
      <Copy>{mode === 'create' ? t.tripFormHint : t.inviteHint}</Copy>
      {mode === 'create' ? (
        <>
          <Copy>{t.ledgerName}</Copy>
          <Notice>{t.ledgerFixed}</Notice>
          {capabilities.data?.nonTwdCreationEnabled && (
            <TextField
              label={t.searchCurrency}
              value={baseSearch}
              onChangeText={setBaseSearch}
              editable={!busy && !confirmed}
              autoCapitalize="characters"
              maxLength={3}
            />
          )}
          {(capabilities.data?.nonTwdCreationEnabled
            ? [
                ...new Set([
                  base,
                  ...capabilities.data.supportedBaseCurrencies
                    .filter((code) => code.includes(baseSearch.trim().toUpperCase()))
                    .slice(0, 12),
                ]),
              ]
            : ['TWD']
          ).map((code) => (
            <Chip
              key={code}
              label={code}
              selected={base === code}
              disabled={busy || confirmed}
              onPress={() => setBase(code)}
            />
          ))}
          <TextField
            inputRef={first}
            testID="trip-name"
            label={t.tripName}
            value={fields.name}
            editable={!busy && !confirmed}
            onChangeText={(value) => edit('name', value)}
            maxLength={100}
            returnKeyType="next"
            onSubmitEditing={() => description.current?.focus()}
          />
          <TextField
            inputRef={description}
            testID="trip-description"
            label={t.tripDescription}
            value={fields.description}
            editable={!busy && !confirmed}
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
            value={fields.start_date}
            editable={!busy && !confirmed}
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
            value={fields.end_date}
            editable={!busy && !confirmed}
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
          value={invite}
          editable={!busy && !confirmed}
          onChangeText={setInvite}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
      )}
      {notSent && <Notice tone="danger">{t.operationNotSent}</Notice>}
      {!!error && <Notice tone="danger">{error}</Notice>}
      {mode === 'create' && capabilities.isError && (
        <Notice tone="warning">{t.ledgerUnavailable}</Notice>
      )}
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      <Action
        testID="trip-confirm"
        label={mode === 'create' ? t.createTrip : t.joinTrip}
        busy={busy}
        disabled={!online || confirmed || (mode === 'create' && !capabilities.data)}
        onPress={() => void submit()}
      />
      <Action
        variant="ghost"
        label={t.pendingOperations}
        onPress={() => router.push('/trips/operations')}
      />
    </FormPage>
  );
}
