'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import type { Member } from '@/types';
import {
  TripMembers,
  TripShare,
  TripDangerZone,
} from '@/components/trips/detail';

// Dialogs
import {
  AddVirtualMemberDialog,
  DeleteTripDialog,
  RemoveMemberDialog,
  ToggleAdminDialog,
  RegisterVirtualMemberDialog,
  LinkExistingMemberDialog,
  RegenerateShareCodeDialog,
} from '@/components/trips/detail/dialogs';

import {
  useCurrentUser,
  useTrip,
  useTripMembership,
  useMemberMutations,
  useTripMutations,
} from '@/hooks/queries';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function TripSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const t = useTranslations();
  const tMember = useTranslations('member');
  const tTrip = useTranslations('trip');
  const tTrips = useTranslations('trips');
  const tError = useTranslations('error');
  const tAction = useTranslations('action');

  const { toast } = useToast();

  const { isSuccess: userResolved } = useCurrentUser();
  const { data: trip, isLoading: tripLoading } = useTrip(tripId);
  const { currentUser, members, isMember: isCurrentUserMember, isAdmin: isCurrentUserAdmin } =
    useTripMembership(tripId);
  const memberMutations = useMemberMutations(tripId);
  const tripMutations = useTripMutations(tripId);

  const loading = tripLoading;
  // Settings strictly requires membership: surface unauthorized/forbidden rather
  // than falling back to the public (read-only) view that useTrip would allow.
  const error = userResolved && !currentUser
    ? tError('unauthorized')
    : !loading && trip && !isCurrentUserMember
      ? tError('forbidden')
      : '';

  // Dialog states
  const [addVirtualMemberDialog, setAddVirtualMemberDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [removeMemberDialog, setRemoveMemberDialog] = useState<{
    open: boolean;
    member: Member | null;
  }>({ open: false, member: null });
  const [toggleAdminDialog, setToggleAdminDialog] = useState<{
    open: boolean;
    member: Member | null;
  }>({ open: false, member: null });

  // Virtual member convert dialogs
  const [registerVirtualDialog, setRegisterVirtualDialog] = useState(false);
  const [linkVirtualDialog, setLinkVirtualDialog] = useState(false);
  const [selectedVirtualMember, setSelectedVirtualMember] = useState<Member | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [membersExpanded, setMembersExpanded] = useState(true);

  // Regenerate share link
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const copyHashCode = async () => {
    try {
      const shareUrl = `${window.location.origin}/join/${trip?.hash_code || ''}`;
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: tAction('copySuccess'),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: tAction('copyFailed'),
      });
    }
  };

  const handleRegenerateShareCode = async () => {
    setIsRegenerating(true);
    try {
      const trip = await tripMutations.regenerate.mutateAsync();
      toast({
        title: tTrip('regenerateSuccess'),
      });
      setRegenerateDialogOpen(false);
      // 目前 URL 仍是已失效的舊 hash_code；換成新碼，頁面後續操作（依 hash_code 解析）才不會 NOT_FOUND
      router.replace(`/trips/${trip.hash_code}/settings`);
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : String(err),
      });
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
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeMemberDialog.member) return;
    try {
      await memberMutations.remove.mutateAsync(removeMemberDialog.member.id);
      toast({
        title: tMember('success.removed'),
      });
      setRemoveMemberDialog({ open: false, member: null });
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleToggleAdmin = async () => {
    if (!toggleAdminDialog.member) return;
    try {
      const newRole = toggleAdminDialog.member.role === 'admin' ? 'member' : 'admin';
      await memberMutations.toggleRole.mutateAsync({
        memberId: toggleAdminDialog.member.id,
        role: newRole,
      });
      toast({
        title: tMember('success.roleUpdated'),
      });
      setToggleAdminDialog({ open: false, member: null });
    } catch (err: unknown) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleAddVirtualMember = async (name: string) => {
    await memberMutations.addVirtual.mutateAsync(name);
    toast({
      title: tMember('virtualMemberAdded'),
    });
    setAddVirtualMemberDialog(false);
  };

  const handleCopyInviteLink = async (member: Member) => {
    try {
      const inviteUrl = `${window.location.origin}/link-virtual/${tripId}/${member.username}`;
      await navigator.clipboard.writeText(inviteUrl);
      toast({
        title: tMember('inviteLinkCopied'),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error",
        description: tAction('copyFailed'),
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md w-full">
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={() => router.push(`/trips/${tripId}`)} size="lg">
            {tTrips('detail.backToTrip')}
          </Button>
        </div>
      </div>
    );
  }

  if (!trip) return null;

  return (
    <div className="min-h-screen bg-background pb-12">
      <Navbar
        user={
          currentUser
            ? {
              id: currentUser.id,
              username: currentUser.display_name,
              email: currentUser.email,
            }
            : null
        }
        showUserMenu={true}
        title={`${tTrip('settings')}`}
      />

      <div className="container mx-auto max-w-4xl pt-24 px-4 sm:px-6">
        {/* 返回按钮 */}
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground mb-6 -ml-2"
          onClick={() => router.push(`/trips/${tripId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {tTrips('detail.backToTrip')}
        </Button>

        <h1 className="text-3xl font-bold mb-8 text-foreground">
          {tTrip('settings')}
        </h1>

        <div className="flex flex-col gap-8">
          {/* 成员管理 */}
          <TripMembers
            members={members}
            currentUser={currentUser}
            isCurrentUserAdmin={!!isCurrentUserAdmin}
            onAddVirtualMember={() => setAddVirtualMemberDialog(true)}
            onRemoveMember={(member) => setRemoveMemberDialog({ open: true, member })}
            onToggleAdmin={(member) => setToggleAdminDialog({ open: true, member })}
            onCopyInviteLink={handleCopyInviteLink}
            onVirtualMemberClick={(member) => {
              setSelectedVirtualMember(member);
              setRegisterVirtualDialog(true);
            }}
            expanded={membersExpanded}
            onToggleExpand={() => setMembersExpanded(!membersExpanded)}
          />

          {/* 分享功能 */}
          <TripShare
            tripHashCode={trip.hash_code}
            onCopy={copyHashCode}
            canRegenerate={!!isCurrentUserAdmin}
            onRegenerate={() => setRegenerateDialogOpen(true)}
            isRegenerating={isRegenerating}
          />

          {/* 危险操作区 */}
          {isCurrentUserAdmin && (
            <TripDangerZone onDelete={() => setDeleteDialogOpen(true)} />
          )}
        </div>
      </div>

      {/* Dialogs */}
      <AddVirtualMemberDialog
        open={addVirtualMemberDialog}
        onClose={() => setAddVirtualMemberDialog(false)}
        onSubmit={handleAddVirtualMember}
      />

      <RegenerateShareCodeDialog
        open={regenerateDialogOpen}
        onClose={() => setRegenerateDialogOpen(false)}
        onConfirm={handleRegenerateShareCode}
        isRegenerating={isRegenerating}
      />

      <DeleteTripDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteTrip}
        tripName={trip.name}
        isDeleting={isDeleting}
      />

      <RemoveMemberDialog
        open={removeMemberDialog.open}
        onClose={() => setRemoveMemberDialog({ open: false, member: null })}
        onConfirm={handleRemoveMember}
        member={removeMemberDialog.member}
      />

      <ToggleAdminDialog
        open={toggleAdminDialog.open}
        onClose={() => setToggleAdminDialog({ open: false, member: null })}
        onConfirm={handleToggleAdmin}
        member={toggleAdminDialog.member}
      />

      <RegisterVirtualMemberDialog
        open={registerVirtualDialog}
        onClose={() => {
          setRegisterVirtualDialog(false);
          setSelectedVirtualMember(null);
        }}
        onSwitchToLink={() => {
          setRegisterVirtualDialog(false);
          setLinkVirtualDialog(true);
        }}
        virtualMember={selectedVirtualMember}
        tripId={tripId}
      />

      <LinkExistingMemberDialog
        open={linkVirtualDialog}
        onClose={() => {
          setLinkVirtualDialog(false);
          setSelectedVirtualMember(null);
        }}
        onSwitchToRegister={() => {
          setLinkVirtualDialog(false);
          setRegisterVirtualDialog(true);
        }}
        virtualMember={selectedVirtualMember}
        tripId={tripId}
      />
    </div>
  );
}
