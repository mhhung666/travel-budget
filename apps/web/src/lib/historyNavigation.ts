// Keep positions from application startup, including routes visited before a
// form/selection mounts. URLs cannot identify entries (the same URL can repeat).
const positionKey = '__travelBudgetHistory';
type Position = { session: string; index: number };
type Guard = () => boolean;
function position(state: unknown): Position | undefined {
  if (!state || typeof state !== 'object' || !(positionKey in state)) return;
  const value = state[positionKey];
  if (
    value &&
    typeof value === 'object' &&
    'session' in value &&
    typeof value.session === 'string' &&
    'index' in value &&
    Number.isSafeInteger(value.index)
  )
    return value as Position;
}
let tracker: ReturnType<typeof createTracker> | undefined;
function createTracker() {
  const history = window.history;
  const push = history.pushState,
    replace = history.replaceState;
  const guards = new Set<Guard>();
  let current = position(history.state) ?? { session: crypto.randomUUID(), index: 0 };
  let restoring = false;
  const withPosition = (state: unknown, value: Position) => ({
    ...(state && typeof state === 'object' ? state : {}),
    [positionKey]: value,
  });
  replace.call(history, withPosition(history.state, current), '');
  const pushState: History['pushState'] = function (state, unused, url) {
    const next = { ...current, index: current.index + 1 };
    push.call(history, withPosition(state, next), unused, url);
    current = next;
  };
  const replaceState: History['replaceState'] = function (state, unused, url) {
    replace.call(history, withPosition(state, current), unused, url);
  };
  history.pushState = pushState;
  history.replaceState = replaceState;
  const traverse = (event: PopStateEvent) => {
    const target = position(event.state);
    // Cross-document navigation is covered by beforeunload. All entries created
    // in this document are tagged, without altering Next's private router state.
    if (!target || target.session !== current.session) return;
    if (restoring) {
      event.stopImmediatePropagation();
      if (target.index === current.index) restoring = false;
      else history.go(current.index - target.index);
      return;
    }
    if (target.index !== current.index && [...guards].some((allow) => !allow())) {
      event.stopImmediatePropagation();
      restoring = true;
      // popstate has already moved the URL; undo the exact signed distance.
      // Both the rejected traversal and its compensation stay out of the router.
      history.go(current.index - target.index);
    } else current = target;
  };
  window.addEventListener('popstate', traverse, true);
  return {
    users: 0,
    root: false,
    block(allow: Guard) {
      guards.add(allow);
      return () => {
        guards.delete(allow);
      };
    },
    stop() {
      window.removeEventListener('popstate', traverse, true);
      if (history.pushState === pushState) history.pushState = push;
      if (history.replaceState === replaceState) history.replaceState = replace;
    },
  };
}

/** Once per document, across account-keyed provider remounts and Next wrappers. */
export function initializeHistoryNavigation() {
  const active = (tracker ??= createTracker());
  if (!active.root) {
    active.root = true;
    active.users++;
  }
}

/** Selection guards share the root's positions and remove only their listener. */
export function retainHistoryNavigation() {
  const active = (tracker ??= createTracker());
  active.users++;
  return {
    block: active.block,
    release() {
      if (--active.users === 0) {
        active.stop();
        tracker = undefined;
      }
    },
  };
}
