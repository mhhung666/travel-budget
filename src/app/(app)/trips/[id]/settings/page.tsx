'use client';

import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { TripMembers, TripShare, TripArchive, TripDangerZone } from '@/components/trips/detail';

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
import { ErrorState } from '@/components/common';

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
    isArchived,
    isArchiving,
    handleRegenerateShareCode,
    handleToggleArchive,
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
      <ErrorState
        message={error}
        onBack={() => router.push(`/trips/${tripId}`)}
        backText={tTrips('detail.backToTrip')}
      />
    );
  }

  if (!trip) return null;

  // 返回鍵由行程空間殼提供（「更多」頁返回行程空間）
  return (
    <div className="container mx-auto max-w-4xl py-4 px-4 sm:px-6">
      <h2 className="mb-6 text-lg font-semibold text-foreground">{tTrip('settings')}</h2>

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
        />

        {/* 分享功能 */}
        <TripShare
          tripHashCode={trip.hash_code}
          canRegenerate={isAdmin}
          onRegenerate={() => regenerateDialog.openDialog()}
          isRegenerating={isRegenerating}
        />

        {/* 封存（個別，全體成員可用） */}
        <TripArchive
          isArchived={isArchived}
          onToggle={handleToggleArchive}
          isToggling={isArchiving}
        />

        {/* 危险操作区 */}
        {isAdmin && <TripDangerZone onDelete={() => deleteDialog.openDialog()} />}
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
