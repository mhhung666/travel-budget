import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import type { Trip, Member } from '@/types';

interface InviteCardProps {
    trip: Trip | null;
    virtualMember: Member | null;
}

export default function InviteCard({ trip, virtualMember }: InviteCardProps) {
    const t = useTranslations('member.convertVirtual');

    return (
        <Card className="text-center">
            <CardHeader className="pb-2">
                <CardTitle className="text-xl">
                    {t('inviteTitle', { tripName: trip?.name || '' })}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <CardDescription className="text-base">
                    {t('inviteDescription', { memberName: virtualMember?.display_name || '' })}
                </CardDescription>
            </CardContent>
        </Card>
    );
}
