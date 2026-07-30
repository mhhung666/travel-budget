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
  requestEmailChange,
  confirmEmailChange,
} from './auth.actions';
export type { AuthUser, AuthUserWithCreatedAt } from './auth.actions';

// Trip actions
export {
  getTrips,
  getTrip,
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
  createNoteUploadUrl,
  createPhotoUploadUrls,
  createAvatarUploadUrl,
  type UploadTicket,
  type PhotoUploadTickets,
} from './upload.actions';

// Avatar actions（R2 頭像）
export { setAvatar, removeAvatar } from './avatar.actions';

// Budget actions
export { setTripBudget } from './budget.actions';

// Currency settings actions
export { setTripCurrencySettings } from './currency.actions';

// Member actions
export {
  getMembers,
  addVirtualMember,
  addFriendsToTrip,
  removeMember,
  updateMemberRole,
} from './member.actions';

// Settlement actions
export { getSettlement } from './settlement.actions';

// Payment actions（結算還款 / 標記已付 / 提醒還款）
export { recordPayment, deletePayment, remindPayment } from './payment.actions';

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
  createChecklistWithItems,
  getCopyableChecklists,
  updateChecklist,
  deleteChecklist,
  addChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
} from './checklist.actions';
export type { CopyableChecklistSource } from './checklist.actions';

// Note actions（隨手記）
export {
  getNotes,
  createNote,
  updateNote,
  deleteNote,
  planNote,
  getNoteAttachmentUrl,
} from './note.actions';

// Photo actions（旅程相簿，ROADMAP #21）
export { getTripPhotos, addTripPhotos, updatePhoto, deletePhotos } from './photo.actions';

// Album share actions（相簿公開分享，PLAN-PHOTOS Phase 4）
export {
  getAlbumShareStatus,
  enableAlbumShare,
  disableAlbumShare,
  type AlbumShareStatus,
} from './albumShare.actions';

// Stats actions
export { getStats, getStatsExpensePage, getTripStats } from './stats.actions';
export type { GetStatsExpensePageOptions } from './stats.actions';

// Year in review actions（年度旅行回顧 / Travel Wrapped）
export { getYearInReview, type YearInReviewResult } from './wrapped.actions';

// Map share actions
export {
  getMapShareStatus,
  enableMapShare,
  disableMapShare,
  type MapShareStatus,
} from './mapShare.actions';

// Map data actions
export { getVisitedPlaces, getMapPhotos, type VisitedPlace, type MapPhoto } from './map.actions';

// Notification actions（站內通知）
export {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from './notification.actions';

// Activity feed actions（動態牆）
export { getActivityLog } from './activity.actions';

// Comment actions（支出留言）
export { getComments, getCommentCounts, createComment, deleteComment } from './comment.actions';

// Push subscription actions（Web Push 訂閱）
export {
  savePushSubscription,
  deletePushSubscription,
  getPushSubscriptions,
  type PushDeviceItem,
} from './push.actions';

// Friend actions（好友系統）
export {
  getFriends,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from './friend.actions';

// Collection actions（旅行成就：飛行/住宿終身紀錄＋造訪國家）
export {
  getCollections,
  getTripCollectionLinks,
  createFlightRecord,
  updateFlightRecord,
  deleteFlightRecord,
  createStayRecord,
  updateStayRecord,
  deleteStayRecord,
} from './collection.actions';

// Loyalty actions（會籍積分與里程紀錄：帳戶＋ledger）
export {
  getLoyalty,
  upsertLoyaltyAccount,
  deleteLoyaltyAccount,
  createLoyaltyEntry,
  updateLoyaltyEntry,
  deleteLoyaltyEntry,
} from './loyalty.actions';

// Locale action（UI 語系 cookie；見 i18n/config.ts 的「無 i18n 路由」設定）
export { setLocale } from './locale.actions';
