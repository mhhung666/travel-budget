import { Tabs, router, useLocalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContentInsets } from '@/components/frame';
import { Action, Icon, Notice, Page, usePalette, type IconName } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import { sizing, spacing, typography } from '@/theme/tokens';
import { useTrip } from '@/features/trips/queries';
import { useAuth } from '@/features/auth/AuthProvider';
import { isAccessDenied } from '@/features/auth/errorMessage';
import { useDraftCatalog } from '@/features/localDrafts/provider';
import { useExpenseOptions } from '@/features/expenses/entryQueries';
import { useOnline } from '@/providers/useOnline';

import { selectTab, type TabBarProps } from '@/components/tabNavigation';
type LayoutProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['layout']>>[0];
function NavigationItem({
  label,
  selected = false,
  icon,
  onPress,
  testID,
  action = false,
}: {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress: () => void;
  testID: string;
  action?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={action ? 'button' : 'tab'}
      accessibilityLabel={label}
      accessibilityState={action ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: sizing.touch,
        flex: 1,
        padding: spacing.small,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.tiny,
        backgroundColor: pressed || selected ? p.selected : p.surface,
      })}
    >
      {icon && <Icon name={icon} color={p.primary} />}
      <Text
        style={[
          typography.label,
          {
            color: selected || action ? p.primary : p.text,
            textAlign: 'center',
            fontWeight: selected ? '700' : '500',
            textDecorationLine: selected ? 'underline' : 'none',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function GlobalTabBar(props: TabBarProps) {
  const p = usePalette();
  const t = useMessages();
  const insets = useSafeAreaInsets();
  const opening = useRef(false);
  const pathname = usePathname();
  useEffect(() => {
    opening.current = false;
  }, [pathname]);
  // The footer remains mounted beneath a pushed form. No footer is rendered by that form's stack.
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        backgroundColor: p.surface,
        borderTopWidth: sizing.border,
        borderTopColor: p.border,
      }}
    >
      <NavigationItem
        label={t.navTrips}
        icon="map-pin"
        selected={props.state.routes[props.state.index].name === 'trips'}
        testID="nav-trips"
        onPress={() => {
          opening.current = false;
          selectTab(props, 'trips');
        }}
      />
      <NavigationItem
        label={t.recordExpense}
        icon="plus"
        action
        testID="nav-record"
        onPress={() => {
          if (opening.current) return;
          opening.current = true;
          router.push('/record');
        }}
      />
      <NavigationItem
        label={t.myAccount}
        icon="user"
        selected={props.state.routes[props.state.index].name === 'me'}
        testID="nav-me"
        onPress={() => {
          opening.current = false;
          selectTab(props, 'me');
        }}
      />
    </View>
  );
}
export function GlobalLayout() {
  const p = usePalette();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: p.background } }}
      layout={({ children }) => (
        <ContentInsets edges={['top', 'left', 'right']}>{children}</ContentInsets>
      )}
      tabBar={(props) => <GlobalTabBar {...props} />}
    >
      <Tabs.Screen name="trips" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

function TripChrome({ children, state, navigation }: LayoutProps) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useMessages();
  const p = usePalette();
  const online = useOnline();
  const { manager, user } = useAuth();
  const { catalog } = useDraftCatalog();
  const query = useTrip(id);
  const options = useExpenseOptions(id);
  const denied =
    isAccessDenied(query.error) ||
    (!!user && !catalog.isVisible({ environment: manager.api.baseUrl, accountId: user.id }, id));
  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: p.surface }}>
        <View style={{ padding: spacing.medium, gap: spacing.small }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.small }}>
            <View style={{ flex: 1 }}>
              <Action
                variant="ghost"
                icon="chevron-left"
                label={t.back}
                testID="trip-back"
                onPress={() => router.dismissTo('/trips')}
              />
            </View>
            {!!query.data && !denied && (
              <Pressable
                testID="trip-invitation"
                accessibilityRole="button"
                accessibilityLabel={t.inviteMembers}
                accessibilityState={{ disabled: !online }}
                disabled={!online}
                onPress={() => router.push({ pathname: '/trips/[id]/invitation', params: { id } })}
                style={{
                  minWidth: sizing.touch,
                  minHeight: sizing.touch,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="user-plus" color={online ? p.primary : p.onDisabled} />
              </Pressable>
            )}
          </View>
          <View style={{ flexDirection: 'row' }}>
            {[
              ['index', t.overview],
              ['expenses', t.expenses],
              ['settlement', t.settlement],
            ].map(([name, label]) => (
              <NavigationItem
                key={name}
                label={label}
                selected={state.routes[state.index].name === name}
                testID={
                  name === 'expenses'
                    ? 'trip-expenses'
                    : name === 'settlement'
                      ? 'trip-settlement'
                      : 'trip-tab-index'
                }
                onPress={() => selectTab({ state, navigation }, name)}
              />
            ))}
          </View>
        </View>
      </SafeAreaView>
      <ContentInsets edges={['left', 'right']}>
        {denied ? (
          <Page>
            <Notice tone="danger">{t.notFound}</Notice>
            <Action
              label={t.retry}
              disabled={!online}
              busy={query.isFetching || options.isFetching}
              onPress={() => {
                void query.refetch();
                void options.refetch();
              }}
            />
          </Page>
        ) : (
          children
        )}
      </ContentInsets>
    </View>
  );
}
export function TripLayout() {
  const t = useMessages();
  return (
    <Tabs
      backBehavior="none"
      screenOptions={{ headerShown: false }}
      tabBar={() => null}
      layout={(props) => <TripChrome {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: t.overview }} />
      <Tabs.Screen name="expenses" options={{ title: t.expenses }} />
      <Tabs.Screen name="settlement" options={{ title: t.settlement }} />
    </Tabs>
  );
}
