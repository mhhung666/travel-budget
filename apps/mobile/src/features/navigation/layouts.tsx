import { Tabs, router, useLocalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationMenu } from '@/components/NavigationMenu';
import { ScrollChromeProvider } from '@/components/scrollChrome';
import { useNavigationFit, type NavigationFit } from '@/components/navigationFit';
import { ContentInsets, useContentEdges } from '@/components/frame';
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
  onTextLayout,
}: {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress: () => void;
  testID: string;
  action?: boolean;
  onTextLayout?: NavigationFit['onTextLayout'];
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
        onTextLayout={onTextLayout}
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
export function GlobalTabBar(
  props: Pick<TabBarProps, 'state' | 'navigation'> & {
    compact?: boolean;
    fit?: NavigationFit;
    menu?: boolean;
  }
) {
  const p = usePalette();
  const t = useMessages();
  const insets = useSafeAreaInsets();
  const opening = useRef(false);
  const pathname = usePathname();
  useEffect(() => {
    opening.current = false;
  }, [pathname]);
  const record = () => {
    if (opening.current) return;
    opening.current = true;
    router.push('/record');
  };
  if (props.menu)
    return (
      <NavigationMenu
        testID="global-navigation-menu"
        title={t.navigationMenu}
        label={props.state.routes[props.state.index].name === 'me' ? t.myAccount : t.navTrips}
        closeLabel={t.closeNavigation}
        choices={[
          {
            label: t.navTrips,
            icon: 'map-pin',
            selected: props.state.routes[props.state.index].name === 'trips',
            testID: 'nav-trips',
            onPress: () => selectTab(props, 'trips'),
          },
          { label: t.recordExpense, icon: 'plus', testID: 'nav-record', onPress: record },
          {
            label: t.myAccount,
            icon: 'user',
            selected: props.state.routes[props.state.index].name === 'me',
            testID: 'nav-me',
            onPress: () => selectTab(props, 'me'),
          },
        ]}
      />
    );
  if (props.compact) return null;
  // The footer remains mounted beneath a pushed form. No footer is rendered by that form's stack.
  return (
    <View
      onLayout={props.fit?.onLayout}
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
        onTextLayout={props.fit?.onTextLayout}
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
        onTextLayout={props.fit?.onTextLayout}
        label={t.recordExpense}
        icon="plus"
        action
        testID="nav-record"
        onPress={record}
      />
      <NavigationItem
        onTextLayout={props.fit?.onTextLayout}
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
  const t = useMessages();
  const fit = useNavigationFit(`${t.navTrips}:${t.recordExpense}:${t.myAccount}`);
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: p.background } }}
      layout={(props) => (
        <ScrollChromeProvider header={fit.compact ? <GlobalTabBar {...props} menu /> : null}>
          <ContentInsets
            edges={fit.compact ? ['top', 'bottom', 'left', 'right'] : ['top', 'left', 'right']}
          >
            {props.children}
          </ContentInsets>
        </ScrollChromeProvider>
      )}
      tabBar={(props) => <GlobalTabBar {...props} compact={fit.compact} fit={fit} />}
    >
      <Tabs.Screen name="trips" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

function TripChrome({ children, state, navigation }: LayoutProps) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const parentEdges = useContentEdges();
  const t = useMessages();
  const p = usePalette();
  const online = useOnline();
  const { manager, user } = useAuth();
  const { catalog } = useDraftCatalog();
  const query = useTrip(id);
  const options = useExpenseOptions(id);
  const fit = useNavigationFit(`${t.overview}:${t.expenses}:${t.settlement}`);
  const choices = [
    { name: 'index', label: t.overview, testID: 'trip-tab-index' },
    { name: 'expenses', label: t.expenses, testID: 'trip-expenses' },
    { name: 'settlement', label: t.settlement, testID: 'trip-settlement' },
  ].map((choice) => ({
    ...choice,
    selected: state.routes[state.index].name === choice.name,
    onPress: () => selectTab({ state, navigation }, choice.name, { id }),
  }));
  const denied =
    isAccessDenied(query.error) ||
    (!!user &&
      !catalog.isVisible({ environment: manager.api.environment, accountId: user.id }, id));
  const menu = (
    <NavigationMenu
      key={id}
      testID="trip-navigation-menu"
      title={t.tripNavigation}
      label={choices.find((choice) => choice.selected)?.label ?? t.overview}
      closeLabel={t.closeNavigation}
      context={!denied ? query.data?.name : undefined}
      choices={choices}
      iconOnly={!fit.compact}
    />
  );
  const header = (
    <View
      // Measure the fixed row only: moving into padded content must not reset its overflow.
      onLayout={fit.compact ? undefined : fit.onLayout}
      style={{
        width: '100%',
        maxWidth: 640,
        alignSelf: 'center',
        paddingHorizontal: fit.compact ? 0 : spacing.medium,
        paddingVertical: spacing.small,
        gap: spacing.small,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.small }}>
        <View style={{ alignSelf: 'flex-start', maxWidth: '100%', flexShrink: 1 }}>
          <Action
            variant="ghost"
            icon="chevron-left"
            label={t.back}
            testID="trip-back"
            onPress={() => router.dismissTo('/trips')}
          />
        </View>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: spacing.small,
          }}
        >
          {!fit.compact && menu}
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
      </View>
      {fit.compact ? (
        menu
      ) : (
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: sizing.border,
            borderBottomColor: p.border,
          }}
        >
          {choices.map(({ name, label, testID, selected, onPress }) => (
            <NavigationItem
              key={name}
              label={label}
              selected={selected}
              testID={testID}
              onTextLayout={fit.onTextLayout}
              // Unvisited sibling tabs have no params; retain this navigator's trip identity.
              onPress={onPress}
            />
          ))}
        </View>
      )}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      {!fit.compact && (
        <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: p.surface }}>
          {header}
        </SafeAreaView>
      )}
      <ScrollChromeProvider header={fit.compact ? header : null}>
        <ContentInsets
          edges={fit.compact ? parentEdges : parentEdges.filter((edge) => edge !== 'top')}
        >
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
      </ScrollChromeProvider>
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
