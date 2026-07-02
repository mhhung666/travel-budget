import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import type { Member } from '@/types';
import { useDialog } from '@/hooks/useDialog';
import { useToast } from '@/hooks/use-toast';
import {
  useCurrentUser,
  useTrip,
  useTripMembership,
  useMemberMutations,
  useTripMutations,
  useTripArchiveMutations,
} from '@/hooks/queries';

/**
 * Controller hook for the trip settings page.
 *
 * Owns data loading, dialog state, the virtual-member convert flow and all the
 * action handlers, so the page component only wires the returned values into
 * presentational components (see IMPROVEMENTS.md #8 — page over-responsibility).
 */
export function useTripSettingsPage(tripId: string) {
  const router = useRouter();
  const tMember = useTranslations('member');
  const tTrip = useTranslations('trip');
  const tError = useTranslations('error');
  const tAction = useTranslations('action');
  const tCommon = useTranslations('common');

  const { toast } = useToast();

  // --- Data ---
  const { isSuccess: userResolved } = useCurrentUser();
  const { data: trip, isLoading: tripLoading } = useTrip(tripId);
  const { currentUser, members, isMember, isAdmin } = useTripMembership(tripId);
  const memberMutations = useMemberMutations(tripId);
  const tripMutations = useTripMutations(tripId);
  const archiveMutations = useTripArchiveMutations();

  const loading = tripLoading;
  // Settings strictly requires membership: surface unauthorized/forbidden rather
  // than falling back to the public (read-only) view that useTrip would allow.
  const error =
    userResolved && !currentUser
      ? tError('unauthorized')
      : !loading && trip && !isMember
        ? tError('forbidden')
        : '';

  // --- Dialog state ---
  const addVirtualMemberDialog = useDialog();
  const deleteDialog = useDialog();
  const regenerateDialog = useDialog();
  const removeMemberDialog = useDialog<Member>();
  const toggleAdminDialog = useDialog<Member>();

  // Virtual-member convert flow: two dialogs sharing the selected member,
  // able to switch back and forth.
  const [registerVirtualOpen, setRegisterVirtualOpen] = useState(false);
  const [linkVirtualOpen, setLinkVirtualOpen] = useState(false);
  const [selectedVirtualMember, setSelectedVirtualMember] = useState<Member | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const isArchived = trip?.archived_at != null;

  const toastError = (err: unknown) => {
    toast({
      variant: 'destructive',
      title: tCommon('errorTitle'),
      description: err instanceof Error ? err.message : String(err),
    });
  };

  // --- Virtual-member convert flow controls ---
  const openVirtualConvert = (member: Member) => {
    setSelectedVirtualMember(member);
    setRegisterVirtualOpen(true);
  };
  const closeVirtualConvert = () => {
    setRegisterVirtualOpen(false);
    setLinkVirtualOpen(false);
    setSelectedVirtualMember(null);
  };
  const switchToLink = () => {
    setRegisterVirtualOpen(false);
    setLinkVirtualOpen(true);
  };
  const switchToRegister = () => {
    setLinkVirtualOpen(false);
    setRegisterVirtualOpen(true);
  };

  // --- Handlers ---
  const handleRegenerateShareCode = async () => {
    setIsRegenerating(true);
    try {
      const updated = await tripMutations.regenerate.mutateAsync();
      toast({
        title: tTrip('regenerateSuccess'),
      });
      regenerateDialog.closeDialog();
      // 目前 URL 仍是已失效的舊 hash_code；換成新碼，頁面後續操作（依 hash_code 解析）才不會 NOT_FOUND
      router.replace(`/trips/${updated.hash_code}/settings`);
    } catch (err: unknown) {
      toastError(err);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDeleteTrip = async () => {
    setIsDeleting(true);
    try {
      await tripMutations.remove.mutateAsync();
      toast({
        title: tTrip('deleted'),
      });
      setTimeout(() => router.push('/trips'), 1000);
    } catch (err: unknown) {
      toastError(err);
    } finally {
      setIsDeleting(false);
      deleteDialog.closeDialog();
    }
  };

  const handleToggleArchive = async () => {
    setIsArchiving(true);
    try {
      if (isArchived) {
        await archiveMutations.unarchive.mutateAsync(tripId);
        toast({ title: tTrip('unarchiveSuccess') });
      } else {
        await archiveMutations.archive.mutateAsync(tripId);
        toast({ title: tTrip('archiveSuccess') });
      }
    } catch (err: unknown) {
      toastError(err);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleRemoveMember = async () => {
    const member = removeMemberDialog.data;
    if (!member) return;
    try {
      await memberMutations.remove.mutateAsync(member.id);
      toast({
        title: tMember('success.removed'),
      });
      removeMemberDialog.closeDialog();
    } catch (err: unknown) {
      toastError(err);
    }
  };

  const handleToggleAdmin = async () => {
    const member = toggleAdminDialog.data;
    if (!member) return;
    try {
      const newRole = member.role === 'admin' ? 'member' : 'admin';
      await memberMutations.toggleRole.mutateAsync({
        memberId: member.id,
        role: newRole,
      });
      toast({
        title: tMember('success.roleUpdated'),
      });
      toggleAdminDialog.closeDialog();
    } catch (err: unknown) {
      toastError(err);
    }
  };

  const handleAddVirtualMember = async (name: string) => {
    await memberMutations.addVirtual.mutateAsync(name);
    toast({
      title: tMember('virtualMemberAdded'),
    });
    addVirtualMemberDialog.closeDialog();
  };

  const handleCopyInviteLink = async (member: Member) => {
    try {
      const inviteUrl = `${window.location.origin}/link-virtual/${tripId}/${member.username}`;
      await navigator.clipboard.writeText(inviteUrl);
      toast({
        title: tMember('inviteLinkCopied'),
      });
    } catch {
      toast({
        variant: 'destructive',
        title: tCommon('errorTitle'),
        description: tAction('copyFailed'),
      });
    }
  };

  return {
    // data
    trip,
    currentUser,
    members,
    isAdmin: !!isAdmin,
    // status
    loading,
    error,
    // dialogs
    addVirtualMemberDialog,
    deleteDialog,
    regenerateDialog,
    removeMemberDialog,
    toggleAdminDialog,
    // virtual-member convert flow
    registerVirtualOpen,
    linkVirtualOpen,
    selectedVirtualMember,
    openVirtualConvert,
    closeVirtualConvert,
    switchToLink,
    switchToRegister,
    // flags
    isDeleting,
    isRegenerating,
    isArchived,
    isArchiving,
    // expand
    // handlers
    handleRegenerateShareCode,
    handleToggleArchive,
    handleDeleteTrip,
    handleRemoveMember,
    handleToggleAdmin,
    handleAddVirtualMember,
    handleCopyInviteLink,
  };
}
