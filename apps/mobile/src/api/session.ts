import { z } from 'zod';
import { ApiClient, ApiError, checkAborted, type RequestOptions } from './client';
import { sessionSchema, type Session, type User } from './contracts';

export interface CredentialStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}
export type AuthState = {
  status: 'loading' | 'signedOut' | 'signedIn' | 'error';
  user: User | null;
  error?: unknown;
};

/** Tokens live here, never in React Query. One refresh per client, guarded against account races. */
export class SessionManager {
  private session: Session | null = null;
  private revision = 0;
  private refreshFlight: Promise<void> | null = null;
  private restoreFlight: Promise<void> | null = null;
  private storageQueue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private state: AuthState = { status: 'loading', user: null };
  constructor(
    public readonly api: ApiClient,
    private store: CredentialStore,
    private clearPrivateData: () => Promise<void>
  ) {}
  getSnapshot = () => this.state;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  private publish(state: AuthState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private storage<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.storageQueue.then(operation, operation);
    this.storageQueue = result.catch(() => {});
    return result;
  }
  private async accept(session: Session, revision: number) {
    if (revision !== this.revision) throw new ApiError('CANCELLED');
    await this.storage(() =>
      revision === this.revision ? this.store.set(session.refreshToken) : Promise.resolve()
    );
    if (revision !== this.revision) throw new ApiError('CANCELLED');
    this.session = session;
    this.publish({ status: 'signedIn', user: session.user });
  }
  private async invalidate(error?: unknown) {
    this.revision++;
    this.session = null;
    this.publish({ status: 'loading', user: null });
    await this.clearPrivateData();
    try {
      await this.storage(() => this.store.clear());
      this.publish({ status: 'signedOut', user: null, ...(error ? { error } : {}) });
    } catch {
      this.publish({ status: 'error', user: null, error: new ApiError('STORAGE') });
      throw new ApiError('STORAGE');
    }
  }
  restore(): Promise<void> {
    if (this.restoreFlight) return this.restoreFlight;
    this.restoreFlight = (async () => {
      this.publish({ status: 'loading', user: null });
      try {
        const token = await this.storage(() => this.store.get());
        if (!token) {
          this.publish({ status: 'signedOut', user: null });
          return;
        }
        await this.refresh(token);
      } catch (error) {
        if (this.state.status !== 'signedOut') this.publish({ status: 'error', user: null, error });
      } finally {
        this.restoreFlight = null;
      }
    })();
    return this.restoreFlight;
  }
  async login(username: string, password: string) {
    const revision = ++this.revision;
    this.session = null;
    await this.clearPrivateData();
    const session = await this.api.request('/auth/login', sessionSchema, {
      method: 'POST',
      body: { username, password },
    });
    try {
      await this.accept(session, revision);
    } catch (error) {
      // If secure persistence fails, do not leave a usable untracked device session behind.
      await this.api
        .request('/auth/logout', z.object({ loggedOut: z.literal(true) }), {
          method: 'POST',
          body: { refreshToken: session.refreshToken },
        })
        .catch(() => {});
      throw error instanceof ApiError ? error : new ApiError('STORAGE');
    }
  }
  private refresh(token = this.session?.refreshToken): Promise<void> {
    if (this.refreshFlight) return this.refreshFlight;
    if (!token) return Promise.reject(new ApiError('UNAUTHORIZED', 401));
    const revision = this.revision;
    const expectedUser = this.session?.user.id;
    this.refreshFlight = (async () => {
      try {
        const session = await this.api.request('/auth/refresh', sessionSchema, {
          method: 'POST',
          body: { refreshToken: token },
        });
        if (expectedUser && session.user.id !== expectedUser)
          throw new ApiError('UNAUTHORIZED', 401);
        await this.accept(session, revision);
      } catch (error) {
        if (revision === this.revision && error instanceof ApiError && error.status === 401)
          await this.invalidate(error);
        throw error;
      } finally {
        this.refreshFlight = null;
      }
    })();
    return this.refreshFlight;
  }
  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: Omit<RequestOptions, 'accessToken'> = {}
  ): Promise<T> {
    const revision = this.revision;
    const accessToken = this.session?.accessToken;
    if (!accessToken) throw new ApiError('UNAUTHORIZED', 401);
    const run = () =>
      this.api.request(path, schema, { ...options, accessToken: this.session?.accessToken });
    try {
      const data = await run();
      if (revision !== this.revision) throw new ApiError('CANCELLED');
      return data;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || revision !== this.revision)
        throw error;
      checkAborted(options.signal);
      // A late 401 for the previous access token reuses the already-refreshed session.
      if (this.session?.accessToken === accessToken) await this.refresh();
      checkAborted(options.signal);
      if (revision !== this.revision) throw new ApiError('CANCELLED');
      try {
        const data = await run();
        if (revision !== this.revision) throw new ApiError('CANCELLED');
        return data;
      } catch (retryError) {
        if (
          revision === this.revision &&
          retryError instanceof ApiError &&
          retryError.status === 401
        )
          await this.invalidate(retryError);
        throw retryError;
      }
    }
  }
  async logout() {
    // Wait for rotation before revoking; network failures retain the session for explicit retry.
    await this.refreshFlight?.catch(() => {});
    const token = this.session?.refreshToken ?? (await this.storage(() => this.store.get()));
    if (token) {
      try {
        await this.api.request('/auth/logout', z.object({ loggedOut: z.literal(true) }), {
          method: 'POST',
          body: { refreshToken: token },
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
      }
    }
    await this.invalidate();
  }
}
