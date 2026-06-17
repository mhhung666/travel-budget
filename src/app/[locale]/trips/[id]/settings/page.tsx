'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
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

import { useTripSettingsPage } from '@/hooks/useTripSettingsPage';

import { TripSettingsSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function TripSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const tTrip = useTranslations('trip');
  const tTrips = useTranslations('trips');

  const {
    trip,
    currentUser,
    members,
    isAdmin,
    loading,
    error,
    addVirtualMemberDialog,
    deleteDialog,
    regenerateDialog,
    removeMemberDialog,
    toggleAdminDialog,
    registerVirtualOpen,
    linkVirtualOpen,
    selectedVirtualMember,
    openVirtualConvert,
    closeVirtualConvert,
    switchToLink,
    switchToRegister,
    isDeleting,
    isRegenerating,
    membersExpanded,
    toggleMembersExpanded,
    handleRegenerateShareCode,
    handleDeleteTrip,
    handleRemoveMember,
    handleToggleAdmin,
    handleAddVirtualMember,
    handleCopyInviteLink,
  } = useTripSettingsPage(tripId);

  if (loading) {
    return <TripSettingsSkeleton />;
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
            isCurrentUserAdmin={isAdmin}
            onAddVirtualMember={() => addVirtualMemberDialog.openDialog()}
            onRemoveMember={(member) => removeMemberDialog.openDialog(member)}
            onToggleAdmin={(member) => toggleAdminDialog.openDialog(member)}
            onCopyInviteLink={handleCopyInviteLink}
            onVirtualMemberClick={openVirtualConvert}
            expanded={membersExpanded}
            onToggleExpand={toggleMembersExpanded}
          />

          {/* 分享功能 */}
          <TripShare
            tripHashCode={trip.hash_code}
            canRegenerate={isAdmin}
            onRegenerate={() => regenerateDialog.openDialog()}
            isRegenerating={isRegenerating}
          />

          {/* 危险操作区 */}
          {isAdmin && (
            <TripDangerZone onDelete={() => deleteDialog.openDialog()} />
          )}
        </div>
      </div>

      {/* Dialogs */}
      <AddVirtualMemberDialog
        open={addVirtualMemberDialog.open}
        onClose={addVirtualMemberDialog.closeDialog}
        onSubmit={handleAddVirtualMember}
      />

      <RegenerateShareCodeDialog
        open={regenerateDialog.open}
        onClose={regenerateDialog.closeDialog}
        onConfirm={handleRegenerateShareCode}
        isRegenerating={isRegenerating}
      />

      <DeleteTripDialog
        open={deleteDialog.open}
        onClose={deleteDialog.closeDialog}
        onConfirm={handleDeleteTrip}
        tripName={trip.name}
        isDeleting={isDeleting}
      />

      <RemoveMemberDialog
        open={removeMemberDialog.open}
        onClose={removeMemberDialog.closeDialog}
        onConfirm={handleRemoveMember}
        member={removeMemberDialog.data}
      />

      <ToggleAdminDialog
        open={toggleAdminDialog.open}
        onClose={toggleAdminDialog.closeDialog}
        onConfirm={handleToggleAdmin}
        member={toggleAdminDialog.data}
      />

      <RegisterVirtualMemberDialog
        open={registerVirtualOpen}
        onClose={closeVirtualConvert}
        onSwitchToLink={switchToLink}
        virtualMember={selectedVirtualMember}
        tripId={tripId}
      />

      <LinkExistingMemberDialog
        open={linkVirtualOpen}
        onClose={closeVirtualConvert}
        onSwitchToRegister={switchToRegister}
        virtualMember={selectedVirtualMember}
        tripId={tripId}
      />
    </div>
  );
}
