import { Action, Notice } from '@/components/ui';
import { useMessages } from '@/i18n/useMessages';
import type { useTripMembers } from './useTripMembers';

/** A read retries normal authorization; it never clears a catalog denial directly. */
export function MemberRosterNotice({
  members,
  online,
}: {
  members: ReturnType<typeof useTripMembers>;
  online: boolean;
}) {
  const t = useMessages();
  if (!members.denied) return null;
  return (
    <>
      <Notice tone="danger">{t.notFound}</Notice>
      <Action
        testID="member-roster-retry"
        label={t.retry}
        disabled={!online || !members.canRead || members.isFetching}
        onPress={() => void members.refetch()}
      />
    </>
  );
}
