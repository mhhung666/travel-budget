'use client';

import { useTranslations } from 'next-intl';
import { Member } from '@/types';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface RemoveMemberDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    member: Member | null;
}

export default function RemoveMemberDialog({
    open,
    onClose,
    onConfirm,
    member,
}: RemoveMemberDialogProps) {
    const tTrip = useTranslations('trip');
    const tCommon = useTranslations('common');
    const tMember = useTranslations('member');

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{tTrip('removeMember')}</DialogTitle>
                </DialogHeader>
                <div className="py-2">
                    <p className="mb-2">
                        {tTrip('removeMemberConfirm', { name: member?.display_name ?? '' })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {tTrip('removeMemberNote')}
                    </p>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {tCommon('cancel')}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={onConfirm}
                    >
                        {tMember('remove')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
