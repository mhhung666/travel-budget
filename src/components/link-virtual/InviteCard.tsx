import { BadgeCheck, Luggage, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Member, Trip } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export type VirtualInviteTrip = Pick<Trip, 'id' | 'name' | 'hash_code'>;

interface InviteCardProps {
  trip: VirtualInviteTrip;
  virtualMember: Member;
}

export default function InviteCard({ trip, virtualMember }: InviteCardProps) {
  const t = useTranslations('member.convertVirtual');
  const initial = virtualMember.display_name.trim().slice(0, 1).toUpperCase();

  return (
    <section className="min-w-0">
      <div className="mb-7 flex items-center gap-3 text-sm font-medium text-primary">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
          <BadgeCheck className="h-4 w-4" />
        </span>
        {t('identityInvitation')}
      </div>

      <h1 className="break-words text-3xl font-semibold leading-tight sm:text-4xl">{trip.name}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
        {t('inviteDescription', { memberName: virtualMember.display_name })}
      </p>

      <div className="mt-8 border-y py-6">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <UserRound className="h-4 w-4" />
          {t('reservedIdentity')}
        </p>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {initial || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{virtualMember.display_name}</p>
            <Badge variant="secondary" className="mt-1 gap-1">
              <Luggage className="h-3 w-3" />
              {t('virtualIdentity')}
            </Badge>
          </div>
        </div>
      </div>

      <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground">
        {t('dataTransferHint')}
      </p>
    </section>
  );
}
