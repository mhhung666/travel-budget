import { describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getRoutes } from 'expo-router/build/getRoutes';
import { StackActions, StackRouter, TabRouter } from 'expo-router/build/react-navigation/routers';
import type { RouteNode } from 'expo-router/build/Route';
import type { RequireContext } from 'expo-router/build/types';
import { selectTab } from './tabNavigation';
import { goBack } from './navigation';

const navigation = vi.hoisted(() => ({ canGoBack: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock('expo-router', () => ({ router: navigation }));

it('preserves every existing public URL and keeps forms outside both sets of tabs', () => {
  const files = readdirSync(fileURLToPath(new URL('../app', import.meta.url)), { recursive: true })
    .filter((file): file is string => typeof file === 'string' && file.endsWith('.tsx'))
    .map((file) => `./${file}`);
  const context = Object.assign(<T>() => ({ default: () => null }) as T, {
    keys: () => files,
    resolve: (key: string) => key,
    id: 'test-routes',
  }) satisfies RequireContext;
  const root = getRoutes(context, { importMode: 'lazy', ignoreEntryPoints: true })!;
  const leaves = new Map<string, string[]>();
  function collect(node: RouteNode, ancestors: string[] = []) {
    const path = [...ancestors, node.route];
    if (node.type === 'route' && !node.generated) {
      const url =
        '/' +
        path
          .flatMap((part) => part.split('/'))
          .filter((part) => part && !part.startsWith('(') && part !== 'index')
          .join('/');
      expect(leaves.has(url), `duplicate URL ${url}`).toBe(false);
      leaves.set(url, path);
    }
    node.children.forEach((child) => collect(child, path));
  }
  collect(root);
  for (const url of [
    '/trips',
    '/trips/[id]',
    '/trips/[id]/expenses',
    '/trips/[id]/settlement',
    '/me',
  ]) {
    expect(leaves.get(url), url).toContain('(tabs)');
  }
  for (const url of [
    '/trips/create',
    '/trips/join',
    '/trips/operations',
    '/trips/[id]/invitation',
    '/trips/[id]/expenses/new',
    '/trips/[id]/expenses/edit',
    '/trips/[id]/expenses/[expenseId]',
    '/trips/[id]/payments/edit',
    '/record',
    '/drafts/[id]',
    '/queue',
    '/work',
  ]) {
    expect(leaves.get(url), url).toBeDefined();
    expect(leaves.get(url), url).not.toContain('(tabs)');
  }
});

describe('stable sibling navigation with the installed native routers', () => {
  it('switches without duplicating routes or losing the trip stack, and ignores the active tab', () => {
    const options = { routeNames: ['trips', 'me'], routeParamList: {}, routeGetIdList: {} };
    const tabs = TabRouter({ backBehavior: 'history', initialRouteName: 'trips' });
    let state = tabs.getInitialState(options);
    const childRouter = StackRouter({ initialRouteName: 'index' });
    const childOptions = { routeNames: ['index', '[id]'], routeParamList: {}, routeGetIdList: {} };
    let child = childRouter.getInitialState(childOptions);
    child = childRouter.getRehydratedState(
      childRouter.getStateForAction(
        child,
        StackActions.push('[id]', { id: 'TEST-trip' }),
        childOptions
      )!,
      childOptions
    );
    state = {
      ...state,
      routes: state.routes.map((route) =>
        route.name === 'trips' ? { ...route, state: child } : route
      ),
    };
    const keys = state.routes.map((route) => route.key);
    const emit = vi.fn(() => ({ defaultPrevented: false }));
    const navigate = vi.fn((name: string) => {
      state = tabs.getRehydratedState(
        tabs.getStateForAction(state, { type: 'NAVIGATE', payload: { name } }, options)!,
        options
      );
    });
    const props = () =>
      ({ state, navigation: { emit, navigate } }) as unknown as Parameters<typeof selectTab>[0];
    selectTab(props(), 'trips');
    expect(navigate).not.toHaveBeenCalled();
    for (let i = 0; i < 8; i++) {
      selectTab(props(), 'me');
      selectTab(props(), 'trips');
    }
    expect(state.routes.map((route) => route.key)).toEqual(keys);
    expect(state.routes).toHaveLength(2);
    expect(state.routes[0]).toMatchObject({ state: child });
    expect(emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: keys[1],
      canPreventDefault: true,
    });
    emit.mockReturnValue({ defaultPrevented: true });
    selectTab(props(), 'me');
    expect(state.index).toBe(0);
  });
  it.each(['trips', '(local)'])(
    'replaces the picker with %s, then cancels to the original mounted tab screen',
    (target) => {
      const stack = StackRouter({ initialRouteName: '(tabs)' });
      const options = {
        routeNames: ['(tabs)', 'trips', '(local)', 'record'],
        routeParamList: {},
        routeGetIdList: {},
      };
      let state = stack.getInitialState(options);
      const origin = state.routes[0].key;
      state = stack.getRehydratedState(
        stack.getStateForAction(state, StackActions.push('record'), options)!,
        options
      );
      state = stack.getRehydratedState(
        stack.getStateForAction(state, StackActions.replace(target), options)!,
        options
      );
      expect(state.routes.map((route) => route.name)).toEqual(['(tabs)', target]);
      state = stack.getRehydratedState(
        stack.getStateForAction(state, { type: 'GO_BACK' }, options)!,
        options
      );
      expect(state.routes).toHaveLength(1);
      expect(state.routes[0].key).toBe(origin);
    }
  );
  it('does not visit earlier trip tabs on Back, while global tabs keep history', () => {
    const trip = TabRouter({ backBehavior: 'none' });
    const options = {
      routeNames: ['index', 'expenses', 'settlement'],
      routeParamList: {},
      routeGetIdList: {},
    };
    let state = trip.getInitialState(options);
    state = trip.getRehydratedState(
      trip.getStateForAction(state, { type: 'NAVIGATE', payload: { name: 'expenses' } }, options)!,
      options
    );
    expect(trip.getStateForAction(state, { type: 'GO_BACK' }, options)).toBeNull();
  });
});

it('backs out to the existing origin, and uses the declared parent for a direct entry', () => {
  navigation.canGoBack.mockReturnValue(true);
  goBack('/trips');
  expect(navigation.back).toHaveBeenCalledOnce();
  expect(navigation.replace).not.toHaveBeenCalled();
  navigation.canGoBack.mockReturnValue(false);
  goBack('/trips');
  expect(navigation.replace).toHaveBeenCalledWith('/trips');
});
