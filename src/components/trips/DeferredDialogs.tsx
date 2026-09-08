'use client';

import type { ComponentProps } from 'react';
import { lazyDialog } from '@/components/common/lazyDialog';

export const CreateTripDialog = lazyDialog(() => import('./CreateTripDialog'));
export const JoinTripDialog = lazyDialog(() => import('./JoinTripDialog'));
export const ExpenseFormSheet = lazyDialog(() => import('./detail/expense-form/ExpenseFormSheet'));
export const BudgetDialog = lazyDialog(() => import('./detail/dialogs/BudgetDialog'));
export const EditTripDialog = lazyDialog(() => import('./detail/dialogs/EditTripDialog'));
export const ItineraryDayDialog = lazyDialog(() => import('./detail/itinerary/ItineraryDayDialog'));
export const ActivityFormDialog = lazyDialog(() => import('./detail/itinerary/ActivityFormDialog'));
export const ItineraryImportDialog = lazyDialog(
  () => import('@/components/ai-import/ItineraryImportDialog')
);
export const NoteEditDialog = lazyDialog<
  ComponentProps<typeof import('./detail/notes/NoteEditDialog').NoteEditDialog> & { open: boolean }
>(async () => ({
  default: (await import('./detail/notes/NoteEditDialog')).NoteEditDialog,
}));
export const PlanNoteSheet = lazyDialog(async () => ({
  default: (await import('./detail/notes/PlanNoteSheet')).PlanNoteSheet,
}));
export const NewChecklistSheet = lazyDialog(async () => ({
  default: (await import('./detail/checklist/NewChecklistSheet')).NewChecklistSheet,
}));
export const RecordPaymentDialog = lazyDialog(
  () => import('@/components/settlement/RecordPaymentDialog')
);

export const AddVirtualMemberDialog = lazyDialog(
  () => import('./detail/dialogs/AddVirtualMemberDialog')
);
export const AddFriendsToTripDialog = lazyDialog(
  () => import('./detail/dialogs/AddFriendsToTripDialog')
);
export const RegisterVirtualMemberDialog = lazyDialog(
  () => import('./detail/dialogs/RegisterVirtualMemberDialog')
);
export const LinkExistingMemberDialog = lazyDialog(
  () => import('./detail/dialogs/LinkExistingMemberDialog')
);
