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
  private refreshRevision = 0;
  private restoreFlight: Promise<void> | null = null;
  private logoutFlight: Promise<void> | null = null;
  private logoutRevision = 0;
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
    try {
      await this.storage(() =>
        revision === this.revision ? this.store.set(session.refreshToken) : Promise.resolve()
      );
    } catch {
      throw new ApiError('STORAGE');
    }
    if (revision !== this.revision) throw new ApiError('CANCELLED');
    this.session = session;
    this.publish({ status: 'signedIn', user: session.user });
  }
  private revoke(refreshToken: string) {
    return this.api.request('/auth/logout', z.object({ loggedOut: z.literal(true) }), {
      method: 'POST',
      body: { refreshToken },
    });
  }
  private async invalidate(error?: unknown) {
    const revision = ++this.revision;
    this.session = null;
    this.publish({ status: 'loading', user: null });
    await this.clearPrivateData();
    try {
      await this.storage(() =>
        revision === this.revision ? this.store.clear() : Promise.resolve()
      );
      if (revision !== this.revision) return;
      this.publish({ status: 'signedOut', user: null, ...(error ? { error } : {}) });
    } catch {
      if (revision !== this.revision) return;
      this.publish({ status: 'error', user: null, error: new ApiError('STORAGE') });
      throw new ApiError('STORAGE');
    }
  }
  restore(): Promise<void> {
    if (this.restoreFlight) return this.restoreFlight;
    const revision = this.revision;
    this.restoreFlight = (async () => {
      this.publish({ status: 'loading', user: null });
      try {
        const token = await this.storage(() => this.store.get());
        if (revision !== this.revision) return;
        if (!token) {
          this.publish({ status: 'signedOut', user: null });
          return;
        }
        await this.refresh(token);
      } catch (error) {
        if (revision === this.revision && this.state.status !== 'signedOut')
          this.publish({ status: 'error', user: null, error });
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
      await this.revoke(session.refreshToken).catch(() => {});
      throw error instanceof ApiError ? error : new ApiError('STORAGE');
    }
  }
  private refresh(token = this.session?.refreshToken): Promise<void> {
    if (this.refreshFlight && this.refreshRevision === this.revision) return this.refreshFlight;
    if (!token) return Promise.reject(new ApiError('UNAUTHORIZED', 401));
    const revision = this.revision;
    this.refreshRevision = revision;
    const expectedUser = this.session?.user.id;
    this.refreshFlight = (async () => {
      try {
        let session: Session;
        try {
          session = await this.api.request('/auth/refresh', sessionSchema, {
            method: 'POST',
            body: { refreshToken: token },
          });
        } catch (error) {
          if (revision !== this.revision) throw new ApiError('CANCELLED');
          // Preserve authentication/transport details, but never present this as a rejection of
          // the resource request that needed the refresh (especially a pending expense write).
          if (error instanceof ApiError)
            throw new ApiError(error.code, error.status, error.retryAfter, 'refresh');
          throw error;
        }
        if (expectedUser && session.user.id !== expectedUser)
          throw new ApiError('UNAUTHORIZED', 401);
        try {
          await this.accept(session, revision);
        } catch (error) {
          // Rotation has consumed the saved token. Never keep using or restoring it.
          try {
            if (revision === this.revision) await this.invalidate(error);
          } finally {
            await this.revoke(session.refreshToken).catch(() => {});
          }
          throw error;
        }
      } catch (error) {
        if (revision === this.revision && error instanceof ApiError && error.status === 401)
          await this.invalidate(error);
        throw error;
      } finally {
        if (this.refreshRevision === revision) this.refreshFlight = null;
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
    // An answer, whether data or an error, that arrives after the sign-in changed belongs to a
    // session that is gone. It must not reach the caller as if it described the current one: a late
    // 400 would otherwise look like proof that a saved request was never written.
    const sameSignIn = () => {
      if (revision !== this.revision) throw new ApiError('CANCELLED');
    };
    try {
      const data = await run();
      sameSignIn();
      return data;
    } catch (error) {
      sameSignIn();
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      checkAborted(options.signal);
      // A late 401 for the previous access token reuses the already-refreshed session.
      if (this.session?.accessToken === accessToken) await this.refresh();
      checkAborted(options.signal);
      sameSignIn();
      try {
        const data = await run();
        sameSignIn();
        return data;
      } catch (retryError) {
        sameSignIn();
        if (retryError instanceof ApiError && retryError.status === 401)
          await this.invalidate(retryError);
        throw retryError;
      }
    }
  }
  /**
   * `request` for work that belongs to one account, such as a saved expense request. It runs only
   * while that account is signed in; after a switch (or sign-out) it fails before any network call,
   * so one account's request is never sent with another account's token.
   */
  requestAs<T>(
    userId: string,
    path: string,
    schema: z.ZodType<T>,
    options: Omit<RequestOptions, 'accessToken'> = {}
  ): Promise<T> {
    if (!this.session) return Promise.reject(new ApiError('UNAUTHORIZED', 401));
    if (this.session.user.id !== userId) return Promise.reject(new ApiError('CANCELLED'));
    return this.request(path, schema, options);
  }
  logout(): Promise<void> {
    if (this.logoutFlight && this.logoutRevision === this.revision) return this.logoutFlight;
    const revision = this.revision;
    this.logoutRevision = revision;
    this.logoutFlight = (async () => {
      try {
        // Wait for rotation before revoking; network failures retain the session for explicit retry.
        if (this.refreshRevision === revision) await this.refreshFlight?.catch(() => {});
        if (revision !== this.revision) return;
        const token = this.session?.refreshToken ?? (await this.storage(() => this.store.get()));
        if (revision !== this.revision) return;
        if (token) {
          try {
            await this.revoke(token);
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 401) throw error;
          }
        }
        if (revision === this.revision) await this.invalidate();
      } finally {
        if (this.logoutRevision === revision) this.logoutFlight = null;
      }
    })();
    return this.logoutFlight;
  }
}
