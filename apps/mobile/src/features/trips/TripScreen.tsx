import { useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import {
  Action,
  Badge,
  Card,
  Copy,
  DetailRow,
  Notice,
  Page,
  Section,
  Title,
  usePalette,
} from '@/components/ui';
import { errorMessage, isAccessDenied } from '@/features/auth/errorMessage';
import { useDisplayFormat } from '@/i18n/useDisplayFormat';
import { useMessages } from '@/i18n/useMessages';
import { useOnline } from '@/providers/useOnline';
import { useTrip } from './queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { sizing, spacing, typography } from '@/theme/tokens';
import { TripFinancialSummary } from './TripSummary';

export function TripScreen({ id }: { id: string }) {
  const query = useTrip(id);
  const trip = query.data;
  const t = useMessages();
  const { money, date } = useDisplayFormat();
  const online = useOnline();
  // Never leave a previously cached member payload visible after access is denied.
  const { manager, user } = useAuth();
  const { catalog } = useDraftCatalog();
  const scope = user ? { environment: manager.api.baseUrl, accountId: user.id } : null;
  const denied = isAccessDenied(query.error) || !scope || !catalog.isVisible(scope, id);
  return (
    <Page>
      {!online && <Notice tone="warning">{t.offline}</Notice>}
      {query.isPending && online && <ActivityIndicator accessibilityLabel={t.loading} />}
      {query.isError && (
        <>
          <Notice tone={trip && !denied ? 'warning' : 'danger'}>
            {trip && !denied ? t.staleData : errorMessage(query.error, t)}
          </Notice>
          <Action
            label={t.retry}
            disabled={!online || query.isFetching}
            onPress={() => void query.refetch()}
          />
        </>
      )}
      {trip && !denied && (
        <>
          <Badge label={trip.archived ? t.archived : t[trip.phase]} />
          <Title>{trip.name}</Title>
          <TripFinancialSummary trip={trip} />
          <Action
            testID="trip-add-expense"
            label={t.addExpense}
            onPress={() => router.push({ pathname: '/trips/[id]/expenses/new', params: { id } })}
          />
          <Action
            testID="trip-settings"
            variant="secondary"
            label={t.tripSettings}
            onPress={() => router.push({ pathname: '/trips/[id]/settings', params: { id } })}
          />
          <Section title={t.tripDetails}>
            <Card>
              <DetailRow
                testID="trip-group-spent"
                label={t.todayGroupSpent}
                value={money(trip.todayGroupSpent)}
              />
              <DetailRow
                label={t.startDate}
                value={trip.startDate ? date(trip.startDate) : t.notSet}
              />
              <DetailRow label={t.endDate} value={trip.endDate ? date(trip.endDate) : t.notSet} />
              <DetailRow label={t.memberCount} value={String(trip.memberCount)} />
              <DetailRow
                testID="trip-budget"
                label={t.budgetTotal}
                value={trip.budgetTotal === null ? t.notSet : money(trip.budgetTotal)}
              />
              <DetailRow label={t.expenseCount} value={String(trip.expenseCount)} />
              <Copy>{t[trip.role]}</Copy>
              <Copy>{t.baseCurrency}</Copy>
              {(!!trip.destination || !!trip.description) && (
                <TripSupplement
                  key={id}
                  destination={trip.destination}
                  description={trip.description}
                />
              )}
            </Card>
          </Section>
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

export function TripSupplement({
  destination,
  description,
}: {
  destination: string | null;
  description: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const t = useMessages();
  const p = usePalette();
  return (
    <>
      <Pressable
        testID="trip-supplement"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t.moreAboutTrip}
        onPress={() => setExpanded((value) => !value)}
        style={{
          minHeight: sizing.touch,
          paddingVertical: spacing.compact,
          justifyContent: 'center',
        }}
      >
        <Text style={[typography.body, { color: p.primary, fontWeight: '600' }]}>
          {t.moreAboutTrip}
        </Text>
      </Pressable>
      {expanded && (
        <>
          {!!destination && <Copy>{destination}</Copy>}
          {!!description && <Copy>{description}</Copy>}
        </>
      )}
    </>
  );
}
