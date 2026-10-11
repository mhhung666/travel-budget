import { Action, Notice } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import type { useTripMembers } from './useTripMembers';
import { errorMessage } from '@/features/auth/errorMessage';

/** A read retries normal authorization; it never clears a catalog denial directly. */
export function MemberRosterNotice({
  members,
  online,
}: {
  members: ReturnType<typeof useTripMembers>;
  online: boolean;
}) {
  const t = useMessages();
  if (!members.denied && !members.error) return null;
  return (
    <>
      <Notice tone={members.denied ? 'danger' : 'warning'}>
        {members.denied ? t.notFound : errorMessage(members.error, t)}
      </Notice>
      <Action
        testID="member-roster-retry"
        label={t.retry}
        disabled={!online || !members.canRead || members.isFetching}
        onPress={() => void members.refetch()}
      />
    </>
  );
}
