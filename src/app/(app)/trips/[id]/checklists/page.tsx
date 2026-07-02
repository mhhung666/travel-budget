'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { ChecklistCard } from '@/components/trips/detail/checklist';
import type { Checklist } from '@/types';
import { useChecklists, useTripMembership, useChecklistMutations } from '@/hooks/queries';
import { ItinerarySkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

export default function ChecklistsPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const t = useTranslations('checklist');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const { data: checklists = [], isLoading: loading, isError } = useChecklists(tripId);
  const { members, isMember } = useTripMembership(tripId);
  const m = useChecklistMutations(tripId);

  const [newListTitle, setNewListTitle] = useState('');
  const [deletingList, setDeletingList] = useState<Checklist | null>(null);

  const canEdit = isMember;

  /** Fire a mutation and surface any failure as a destructive toast. */
  const guard = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (err: unknown) {
      toast({
        title: tCommon('errorTitle'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  const handleAddList = () => {
    const title = newListTitle.trim();
    if (!title) return;
    setNewListTitle('');
    guard(m.createList.mutateAsync(title));
  };

  const confirmDeleteList = () => {
    if (!deletingList) return;
    const id = deletingList.id;
    setDeletingList(null);
    guard(m.removeList.mutateAsync(id));
  };

  if (loading) {
    return <ItinerarySkeleton />;
  }

  if (isError) {
    return (
      <ErrorState
        message={t('loadFailed')}
        onBack={() => router.push(`/trips/${tripId}`)}
        backText={t('backToTrip')}
      />
    );
  }

  // 頁首由行程空間殼提供（分頁列已標示所在位置）
  return (
    <div className="container mx-auto max-w-3xl py-4 px-4 sm:px-6">
      {/* Add new list */}
      {canEdit && (
        <div className="mb-6 flex items-center gap-2">
          <Input
            value={newListTitle}
            onChange={(e) => setNewListTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddList();
              }
            }}
            placeholder={t('listTitlePlaceholder')}
          />
          <Button
            onClick={handleAddList}
            disabled={!newListTitle.trim()}
            className="shrink-0 gap-2"
          >
            <Plus className="h-4 w-4" />
            {t('addList')}
          </Button>
        </div>
      )}

      {checklists.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
          <h3 className="text-xl font-semibold mb-2">{t('emptyState')}</h3>
          <p className="text-muted-foreground">{t('emptyStateHint')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {checklists.map((list) => (
            <ChecklistCard
              key={list.id}
              checklist={list}
              members={members}
              canEdit={canEdit}
              onAddItem={(text) =>
                guard(m.addItem.mutateAsync({ checklistId: list.id, data: { text } }))
              }
              onToggleItem={(itemId, dn) =>
                guard(
                  m.updateItem.mutateAsync({ checklistId: list.id, itemId, data: { done: dn } })
                )
              }
              onAssignItem={(itemId, assignee_id) =>
                guard(
                  m.updateItem.mutateAsync({
                    checklistId: list.id,
                    itemId,
                    data: { assignee_id },
                  })
                )
              }
              onRemoveItem={(itemId) =>
                guard(m.removeItem.mutateAsync({ checklistId: list.id, itemId }))
              }
              onRename={(title) => guard(m.renameList.mutateAsync({ checklistId: list.id, title }))}
              onDelete={() => setDeletingList(list)}
            />
          ))}
        </div>
      )}

      {/* Delete list confirmation */}
      <AlertDialog open={!!deletingList} onOpenChange={(open) => !open && setDeletingList(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteListConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteListMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteList}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tCommon('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
