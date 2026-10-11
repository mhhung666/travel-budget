import {
  friendsSchema,
  friendMutationSchema,
  idSchema,
  type Friends,
  type FriendCommand,
} from '@travel-budget/contracts';
import { tripMembersSchema, type TripMembers } from '@/api/contracts';
import { ApiError } from '@/api/client';
import type { SessionManager } from '@/api/session';
export type FriendSource = { tripId: string; targetUserId: string };
export type FriendsState = {
  data?: Friends;
  candidate?: { id: string; name: string; roster: TripMembers['members'] };
  busy: boolean;
  uncertain: boolean;
  needsRefresh: boolean;
  error?: unknown;
  result?: 'pending' | 'accepted' | 'deleted' | 'current';
};
/** Online-only relationships. Unknown writes are never resent automatically. */
export class FriendsManager {
  private state: FriendsState = { busy: false, uncertain: false, needsRefresh: false };
  private listeners = new Set<() => void>();
  private version: number;
  private actor: string;
  private active = true;
  constructor(
    private session: SessionManager,
    private available: () => boolean,
    private source?: FriendSource,
    private captureSourceAccess: () => () => void = () => () => {}
  ) {
    this.version = session.getSignInVersion();
    this.actor = session.getSnapshot().user?.id ?? '';
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  dispose() {
    this.active = false;
  }
  private current() {
    return (
      this.active &&
      this.session.getSignInVersion() === this.version &&
      this.session.getSnapshot().status === 'signedIn' &&
      this.session.getSnapshot().user?.id === this.actor
    );
  }
  private publish(patch: Partial<FriendsState>) {
    if (!this.current()) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
  private guard = () => {
    if (!this.current()) throw new ApiError('CANCELLED');
    if (!this.available()) throw new ApiError('FRIEND_OFFLINE');
  };
  private async list() {
    this.guard();
    return this.session.requestAs(this.actor, '/me/friends', friendsSchema, {
      beforeSend: this.guard,
    });
  }
  private async candidate() {
    this.publish({ candidate: undefined });
    if (!this.source) return;
    const { tripId, targetUserId } = this.source;
    if (!idSchema.safeParse(tripId).success || !idSchema.safeParse(targetUserId).success)
      throw new ApiError('VALIDATION_ERROR');
    const access = this.captureSourceAccess();
    const beforeSend = () => {
      this.guard();
      access();
    };
    beforeSend();
    const roster = await this.session.requestAs(
      this.actor,
      `/trips/${tripId}/members`,
      tripMembersSchema,
      { beforeSend }
    );
    beforeSend();
    const member = roster.members.find((m) => m.id === targetUserId);
    if (!member || member.id === this.actor || member.isVirtual)
      throw new ApiError('NOT_FOUND', 404);
    this.publish({
      candidate: { id: member.id, name: member.displayName, roster: roster.members },
    });
    return beforeSend;
  }
  async read() {
    if (!this.current() || this.state.busy) return;
    const hadData = !!this.state.data;
    this.publish({ busy: true, error: undefined, candidate: undefined });
    try {
      const data = await this.list();
      this.publish({
        data,
        uncertain: false,
        needsRefresh: false,
        result: hadData ? 'current' : undefined,
      });
      await this.candidate();
    } catch (error) {
      this.publish({ error });
    } finally {
      this.publish({ busy: false });
    }
  }
  async mutate(action: 'invite' | FriendCommand, id: string) {
    if (
      !this.current() ||
      this.state.busy ||
      this.state.uncertain ||
      this.state.needsRefresh ||
      !this.state.data
    )
      return;
    if (action === 'invite') {
      if (!this.state.candidate || this.state.candidate.id !== id) return;
    } else {
      const data = this.state.data;
      const row = (
        action === 'remove' ? data.friends : action === 'withdraw' ? data.outgoing : data.incoming
      ).find((r) => r.id === id);
      if (!row) return;
    }
    this.publish({ busy: true, error: undefined, result: undefined });
    let sent = false;
    try {
      this.guard();
      const access = action === 'invite' ? await this.candidate() : undefined;
      const result = await this.session.requestAs(
        this.actor,
        action === 'invite' ? '/me/friends' : `/me/friends/${id}`,
        friendMutationSchema,
        {
          method: 'POST',
          body: action === 'invite' ? { target_user_id: id } : { action },
          beforeSend: () => {
            this.guard();
            access?.();
            sent = true;
          },
        }
      );
      this.publish({ result: result.status, needsRefresh: true });
      const data = await this.list();
      this.publish({ data, needsRefresh: false });
    } catch (error) {
      const confirmed = !!this.state.result;
      const definite =
        error instanceof ApiError &&
        [
          'VALIDATION_ERROR',
          'NOT_FOUND',
          'FORBIDDEN',
          'ALREADY_FRIENDS',
          'REQUEST_PENDING',
          'RATE_LIMITED',
          'FRIEND_OFFLINE',
        ].includes(error.code);
      this.publish({
        error,
        uncertain: !confirmed && sent && !definite,
        needsRefresh:
          confirmed ||
          (error instanceof ApiError &&
            ['NOT_FOUND', 'ALREADY_FRIENDS', 'REQUEST_PENDING'].includes(error.code)),
      });
    } finally {
      this.publish({ busy: false });
    }
  }
}
