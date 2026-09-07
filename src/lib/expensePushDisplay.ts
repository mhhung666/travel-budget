/** Browser notification replacement is best-effort, not a durable delivery acknowledgement. */
export function expensePushDisplayOptions(tag: unknown): { tag?: string; renotify?: false } {
  return typeof tag === 'string' && /^expense_added:[a-f0-9]{24}$/.test(tag)
    ? { tag, renotify: false }
    : {};
}
