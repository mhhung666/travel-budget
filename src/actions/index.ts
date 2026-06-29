// Types
export * from './types';

// Auth actions
export {
  getCurrentUser,
  login,
  register,
  logout,
  updateProfile,
  updateNotificationPrefs,
  requestPasswordReset,
  resetPassword,
} from './auth.actions';
export type { AuthUser, AuthUserWithCreatedAt } from './auth.actions';

// Trip actions
export {
  getTrips,
  getTrip,
  getTripPreview,
  createTrip,
  updateTrip,
  deleteTrip,
  regenerateHashCode,
  archiveTrip,
  unarchiveTrip,
  joinTrip,
} from './trip.actions';

// Expense actions
export {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getReceiptUrl,
} from './expense.actions';

// Upload actions（R2 blob 上傳簽名）
export {
  createReceiptUploadUrl,
  createItineraryUploadUrl,
  createAvatarUploadUrl,
  type UploadTicket,
} from './upload.actions';

// Avatar actions（R2 頭像）
export { setAvatar, removeAvatar } from './avatar.actions';

// Budget actions
export { setTripBudget } from './budget.actions';

// Member actions
export { getMembers, addVirtualMember, removeMember, updateMemberRole } from './member.actions';

// Settlement actions
export { getSettlement } from './settlement.actions';

// Payment actions（結算還款 / 標記已付）
export { recordPayment, deletePayment } from './payment.actions';

// Itinerary actions
export {
  getItinerary,
  createItineraryDay,
  updateItineraryDay,
  deleteItineraryDay,
  getItineraryAttachmentUrl,
} from './itinerary.actions';

// Checklist actions（打包清單 / 待辦）
export {
  getChecklists,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  addChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
} from './checklist.actions';

// Stats actions
export { getStats, getTripStats } from './stats.actions';

// Map share actions
export {
  getMapShareStatus,
  enableMapShare,
  disableMapShare,
  type MapShareStatus,
} from './mapShare.actions';

// Map data actions
export { getVisitedPlaces, type VisitedPlace, type HeatWeightBy } from './map.actions';

// Notification actions（站內通知）
export {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from './notification.actions';

// Activity feed actions（動態牆）
export { getActivityLog } from './activity.actions';

// Push subscription actions（Web Push 訂閱）
export { savePushSubscription, deletePushSubscription } from './push.actions';
