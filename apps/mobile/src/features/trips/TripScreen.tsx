import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Action, Copy, Metric, Notice, Page, Title } from '@/components/ui';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { money } from '@/i18n/format';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { useTrip } from './queries';

export function TripScreen({ id }: { id: string }) {
  const query = useTrip(id);
  const trip = query.data;
  const t = useMessages();
  const online = useOnline();
  // Never leave a previously cached member payload visible after access is denied.
  const denied = isAccessDenied(query.error);
  return (
    <Page>
      <Action
        testID="trip-back"
        secondary
        label={t.back}
        onPress={() => router.replace('/trips')}
      />
      {!online && <Notice>{t.offline}</Notice>}
      {query.isPending && online && <ActivityIndicator accessibilityLabel={t.loading} />}
      {query.isError && (
        <>
          <Notice>{trip && !denied ? t.staleData : errorMessage(query.error, t)}</Notice>
          <Action
            label={t.retry}
            disabled={!online || query.isFetching}
            onPress={() => void query.refetch()}
          />
        </>
      )}
      {trip && !denied && (
        <>
          <Copy>{trip.archived ? t.archived : t[trip.phase]}</Copy>
          <Title>{trip.name}</Title>
          {!!trip.destination && <Copy>{trip.destination}</Copy>}
          {!!trip.description && <Copy>{trip.description}</Copy>}
          <Copy>{t[trip.role]}</Copy>
          <Action
            testID="trip-expenses"
            label={t.expenses}
            onPress={() => router.push({ pathname: '/trips/[id]/expenses', params: { id } })}
          />
          <Action
            testID="trip-settlement"
            label={t.settlement}
            onPress={() => router.push({ pathname: '/trips/[id]/settlement', params: { id } })}
          />
          <Metric label={t.startDate} value={trip.startDate ?? t.notSet} />
          <Metric label={t.endDate} value={trip.endDate ?? t.notSet} />
          <View style={{ marginTop: 8 }}>
            <Title>{t.overview}</Title>
          </View>
          <Metric testID="trip-my-spent" label={t.mySpent} value={money(trip.mySpent)} />
          <Metric
            testID="trip-balance"
            label={
              trip.myBalance === 0 ? t.balanced : trip.myBalance > 0 ? t.receivable : t.payable
            }
            value={money(Math.abs(trip.myBalance))}
          />
          <Metric
            testID="trip-group-spent"
            label={t.todayGroupSpent}
            value={money(trip.todayGroupSpent)}
          />
          <Metric
            testID="trip-budget"
            label={t.budgetTotal}
            value={trip.budgetTotal === null ? t.notSet : money(trip.budgetTotal)}
          />
          <Metric label={t.memberCount} value={String(trip.memberCount)} />
          <Metric label={t.expenseCount} value={String(trip.expenseCount)} />
          <Copy>{t.baseCurrency}</Copy>
          <Notice>{t.nextFeatures}</Notice>
          <Action
            testID="trip-refresh"
            secondary
            label={query.isFetching ? t.loading : t.refresh}
            busy={query.isFetching}
            disabled={!online}
            onPress={() => void query.refetch()}
          />
        </>
      )}
    </Page>
  );
}
