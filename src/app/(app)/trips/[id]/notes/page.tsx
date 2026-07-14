'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, StickyNote } from 'lucide-react';
import type { TripNote, ExpenseAttachment } from '@/types';
import { ROUTES } from '@/constants/routes';
import { useNotes, useNoteMutations, useTripMembership } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ItinerarySkeleton } from '@/components/skeletons';
import { ConfirmDialog, EmptyState, ErrorState } from '@/components/common';
import {
  NoteComposer,
  NoteCard,
  NoteEditDialog,
  PlanNoteSheet,
} from '@/components/trips/detail/notes';

/**
 * 隨手記分頁：頂部快速輸入框（Enter 即存）＋ 卡片列表（釘選優先、新到舊）。
 * 已轉成行程的筆記收進底部摺疊區。頁首由行程空間殼提供。
 */
export default function NotesPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const t = useTranslations('notes');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const { data: notes = [], isLoading: loading, isError } = useNotes(tripId);
  const { isMember } = useTripMembership(tripId);
  const m = useNoteMutations(tripId);

  const [editingNote, setEditingNote] = useState<TripNote | null>(null);
  const [planningNote, setPlanningNote] = useState<TripNote | null>(null);
  const [deletingNote, setDeletingNote] = useState<TripNote | null>(null);
  const [plannedOpen, setPlannedOpen] = useState(false);

  const canEdit = isMember;

  const { active, planned } = useMemo(
    () => ({
      active: notes.filter((n) => n.planned_at === null),
      planned: notes.filter((n) => n.planned_at !== null),
    }),
    [notes]
  );

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

  const handleSaveEdit = async (text: string, attachments: ExpenseAttachment[]) => {
    if (!editingNote) return;
    const noteId = editingNote.id;
    await guard(m.update.mutateAsync({ noteId, data: { text, attachments } }));
    setEditingNote(null);
  };

  const handlePickDay = async (dayId: string) => {
    if (!planningNote) return;
    const note = planningNote;
    await guard(
      m.plan.mutateAsync({ noteId: note.id, dayId }).then((updated) => {
        toast({ description: t('planSuccess', { day: updated.planned_day_number ?? '?' }) });
      })
    );
    setPlanningNote(null);
  };

  const confirmDelete = () => {
    if (!deletingNote) return;
    const noteId = deletingNote.id;
    setDeletingNote(null);
    guard(m.remove.mutateAsync(noteId));
  };

  if (loading) {
    return <ItinerarySkeleton />;
  }

  if (isError) {
    return (
      <ErrorState
        message={t('loadFailed')}
        onBack={() => router.push(ROUTES.TRIP_DETAIL(tripId))}
        backText={t('backToTrip')}
      />
    );
  }

  // 頁首由行程空間殼提供（分頁列已標示所在位置）
  return (
    <div className="container mx-auto max-w-3xl px-4 py-4 sm:px-6">
      {canEdit && (
        <div className="mb-4">
          <NoteComposer
            tripId={tripId}
            onSubmit={(text, attachments) => guard(m.create.mutateAsync({ text, attachments }))}
            pending={m.create.isPending}
          />
        </div>
      )}

      {notes.length === 0 ? (
        <EmptyState icon={StickyNote} title={t('emptyState')} description={t('emptyStateHint')} />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {active.map((note) => (
              <NoteCard
                key={note.id}
                tripId={tripId}
                note={note}
                canEdit={canEdit}
                onEdit={() => setEditingNote(note)}
                onTogglePin={() =>
                  guard(m.update.mutateAsync({ noteId: note.id, data: { pinned: !note.pinned } }))
                }
                onPlan={() => setPlanningNote(note)}
                onDelete={() => setDeletingNote(note)}
                onToggleTask={(text) =>
                  guard(m.update.mutateAsync({ noteId: note.id, data: { text } }))
                }
              />
            ))}
            {active.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('allPlanned')}</p>
            )}
          </div>

          {/* 已規劃：摺疊在最下方，維持列表聚焦在還沒處理的點子 */}
          {planned.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setPlannedOpen((o) => !o)}
                className="flex w-full items-center gap-1.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                aria-expanded={plannedOpen}
              >
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', !plannedOpen && '-rotate-90')}
                />
                {t('plannedSection', { count: planned.length })}
              </button>
              {plannedOpen && (
                <div className="mt-2 flex flex-col gap-3">
                  {planned.map((note) => (
                    <NoteCard
                      key={note.id}
                      tripId={tripId}
                      note={note}
                      canEdit={canEdit}
                      onEdit={() => setEditingNote(note)}
                      onTogglePin={() => {}}
                      onPlan={() => {}}
                      onDelete={() => setDeletingNote(note)}
                      onToggleTask={() => {}}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <NoteEditDialog
        tripId={tripId}
        note={editingNote}
        saving={m.update.isPending}
        onSave={handleSaveEdit}
        onClose={() => setEditingNote(null)}
      />

      <PlanNoteSheet
        tripId={tripId}
        open={planningNote !== null}
        pending={m.plan.isPending}
        onPickDay={handlePickDay}
        onClose={() => setPlanningNote(null)}
      />

      <ConfirmDialog
        open={deletingNote !== null}
        title={t('deleteConfirmTitle')}
        message={t('deleteConfirmMessage')}
        severity="error"
        confirmText={t('delete')}
        loading={m.remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingNote(null)}
      />
    </div>
  );
}
