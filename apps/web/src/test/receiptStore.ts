interface IdSearch {
  $gte: string;
  $lt: string;
  $regex: string;
  $options: string;
}

/**
 * `findOne` over an in-memory map of receipts, for tests that replace the `expensecreaterequests`
 * collection. It understands exactly the two lookups `lib/expenseCreateRequest.ts` issues (a plain
 * `_id`, or an `_id` range with a case-insensitive pattern, sorted by `_id`) and refuses anything
 * else, so a changed query shape fails the test instead of silently matching nothing.
 */
export function findStoredReceipt<T extends { _id: string }>(
  store: Map<string, T>,
  { _id }: { _id: string | IdSearch },
  options?: { sort?: Record<string, number> }
): T | null {
  if (typeof _id === 'string') return store.get(_id) ?? null;
  const operators = Object.keys(_id).sort().join();
  if (operators !== '$gte,$lt,$options,$regex') throw new Error(`Unsupported filter ${operators}`);
  if (_id.$options !== 'i') throw new Error(`Unsupported options ${_id.$options}`);
  if (JSON.stringify(options?.sort) !== '{"_id":1}') throw new Error('Sort by _id');
  const pattern = new RegExp(_id.$regex, 'i');
  const found = [...store.values()].filter(
    (receipt) => receipt._id >= _id.$gte && receipt._id < _id.$lt && pattern.test(receipt._id)
  );
  return found.sort((a, b) => (a._id < b._id ? -1 : 1))[0] ?? null;
}
