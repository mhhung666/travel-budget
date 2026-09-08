/** Aggregate only enabled reads; undefined is missing, successful null remains data. */
export interface ReadState {
  data: unknown;
  isError?: boolean;
  isFetching?: boolean;
  isPaused?: boolean;
  isPending?: boolean;
  isLoading?: boolean;
  refetch: () => unknown;
}

export function combineReadStates(queries: ReadState[]) {
  return {
    data: queries.every((query) => query.data !== undefined) ? true : undefined,
    isError: queries.some((query) => query.isError),
    isFetching: queries.some((query) => query.isFetching),
    isPaused: queries.some((query) => query.isPaused),
    isPending: queries.some((query) => query.isPending),
    isLoading: queries.some((query) => query.isLoading),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
