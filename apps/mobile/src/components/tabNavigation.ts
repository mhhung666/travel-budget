import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
/** Selecting a sibling uses the mounted navigator, never pushes a new screen. */
export function selectTab(
  { state, navigation }: Pick<TabBarProps, 'state' | 'navigation'>,
  name: string,
  parentParams?: Record<string, string>
) {
  const route = state.routes.find((item) => item.name === name);
  if (!route || state.routes[state.index].key === route.key) return;
  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
  if (!event.defaultPrevented)
    navigation.navigate(
      route.name,
      parentParams ? { ...route.params, ...parentParams } : route.params
    );
}
