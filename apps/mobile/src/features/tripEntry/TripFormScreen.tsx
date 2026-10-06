import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, TextInput } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { tripFieldsSchema } from '@travel-budget/contracts';
import { Action, Notice, Page, TextField, Title } from '@/components/ui';
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
    Alert.alert(t.unsavedTrip, undefined, [
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
      payload = { operation: 'trip.create', body: parsed.data };
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
            router.replace({ pathname: '/trips/[id]', params: { id: outcome.result.resourceId } });
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
    <Page form>
      <Action secondary label={t.back} disabled={busy} onPress={() => router.back()} />
      <Title>{mode === 'create' ? t.createTrip : t.joinTrip}</Title>
      <Notice>{mode === 'create' ? t.tripFormHint : t.inviteHint}</Notice>
      {mode === 'create' ? (
        <>
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
            placeholder="YYYY-MM-DD"
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
            placeholder="YYYY-MM-DD"
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
      {notSent && <Notice>{t.operationNotSent}</Notice>}
      {!!error && <Notice>{error}</Notice>}
      {!online && <Notice>{t.offline}</Notice>}
      <Action
        testID="trip-confirm"
        label={mode === 'create' ? t.createTrip : t.joinTrip}
        busy={busy}
        disabled={!online || confirmed}
        onPress={() => void submit()}
      />
      <Action
        secondary
        label={t.pendingOperations}
        onPress={() => router.push('/trips/operations')}
      />
    </Page>
  );
}
