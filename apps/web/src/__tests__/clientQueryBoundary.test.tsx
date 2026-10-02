import { act, cleanup, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { ClientQueryBoundary } from '@/components/common/ClientQueryBoundary';

afterEach(cleanup);

it('hydrates the server fallback even when cache data arrives before hydration', async () => {
  const load = vi.fn(async () => 'network');
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  function Content() {
    const { data } = useQuery({ queryKey: ['fixture'], queryFn: load });
    return <p>{data}</p>;
  }
  function App() {
    return (
      <QueryClientProvider client={client}>
        <ClientQueryBoundary fallback={<p>loading fixture</p>}>
          <Content />
        </ClientQueryBoundary>
      </QueryClientProvider>
    );
  }
  const container = document.createElement('div');
  document.body.append(container);
  container.innerHTML = renderToString(<App />);
  expect(container).toHaveTextContent('loading fixture');
  expect(load).not.toHaveBeenCalled();
  // Model IndexedDB completing before selective hydration of this route.
  client.setQueryData(['fixture'], 'persisted fixture');
  const onRecoverableError = vi.fn();
  let root!: Root;
  await act(async () => {
    root = hydrateRoot(container, <App />, { onRecoverableError });
  });
  expect(screen.getByText('persisted fixture')).toBeInTheDocument();
  expect(onRecoverableError).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
  await act(async () => {
    client.setQueryData(['fixture'], 'updated fixture');
  });
  expect(await screen.findByText('updated fixture')).toBeInTheDocument();
  expect(screen.queryByText('loading fixture')).not.toBeInTheDocument();
  await act(async () => root.unmount());
  container.remove();
  client.clear();
});
