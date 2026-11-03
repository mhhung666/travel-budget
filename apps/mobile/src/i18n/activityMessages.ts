import { itineraryMessages } from './itineraryMessages';
const en = {
  ...itineraryMessages.en,
  add: 'Add activity',
  edit: 'Edit activity',
  remove: 'Delete activity',
  title: 'Activity title',
  content: 'Notes',
  type: 'Activity type',
  time: 'Start time (HH:mm)',
  endTime: 'End time (HH:mm)',
  timeHint:
    'Times are optional and use the local 24-hour clock. For an overnight activity, the end time may be earlier than the start.',
  locationName: 'Place description',
  confirmationCode: 'Booking / confirmation code',
  deleteHint:
    'This activity and its ticket attachments will be removed. The day, other activities, expenses and photos remain.',
  conflict:
    'This activity or its day has changed. Review the latest information before confirming again.',
  missing: 'This day or activity no longer exists. Your unsubmitted input remains below.',
  invalid: 'Check the title, activity type, 24-hour times and place coordinates.',
  limit:
    'This day has reached the activity limit. Read the latest information before trying again.',
};
type Copy = typeof en;
export const activityMessages: Record<'zh' | 'zh-CN' | 'en' | 'jp', Copy> = {
  en,
  zh: {
    ...itineraryMessages.zh,
    add: '新增活動',
    edit: '編輯活動',
    remove: '刪除活動',
    title: '活動標題',
    content: '備註',
    type: '活動類型',
    time: '開始時間（HH:mm）',
    endTime: '結束時間（HH:mm）',
    timeHint: '時間可留空，使用當地 24 小時制。跨夜活動的結束時間可以早於開始時間。',
    locationName: '地點說明',
    confirmationCode: '訂位／確認碼',
    deleteHint: '將刪除此活動與其票券附件；行程日、其他活動、支出及照片仍保留。',
    conflict: '此活動或所屬行程日已變更，請核對最新資訊後再次確認。',
    missing: '此行程日或活動已不存在，尚未提交的輸入仍保留在下方。',
    invalid: '請檢查標題、活動類型、24 小時制時間及地點經緯度。',
    limit: '此行程日已達活動數量上限，請讀取最新資訊後再試。',
  },
  'zh-CN': {
    ...itineraryMessages['zh-CN'],
    add: '新增活动',
    edit: '编辑活动',
    remove: '删除活动',
    title: '活动标题',
    content: '备注',
    type: '活动类型',
    time: '开始时间（HH:mm）',
    endTime: '结束时间（HH:mm）',
    timeHint: '时间可留空，使用当地 24 小时制。跨夜活动的结束时间可以早于开始时间。',
    locationName: '地点说明',
    confirmationCode: '订位／确认码',
    deleteHint: '将删除此活动与其票券附件；行程日、其他活动、支出及照片仍保留。',
    conflict: '此活动或所属行程日已变更，请核对最新信息后再次确认。',
    missing: '此行程日或活动已不存在，尚未提交的输入仍保留在下方。',
    invalid: '请检查标题、活动类型、24 小时制时间及地点经纬度。',
    limit: '此行程日已达活动数量上限，请读取最新信息后重试。',
  },
  jp: {
    ...itineraryMessages.jp,
    add: 'アクティビティを追加',
    edit: 'アクティビティを編集',
    remove: 'アクティビティを削除',
    title: 'アクティビティ名',
    content: 'メモ',
    type: '種類',
    time: '開始時刻（HH:mm）',
    endTime: '終了時刻（HH:mm）',
    timeHint:
      '時刻は任意で、現地の24時間表記です。日をまたぐ場合、終了時刻は開始時刻より前でも入力できます。',
    locationName: '場所の説明',
    confirmationCode: '予約／確認番号',
    deleteHint:
      'このアクティビティとチケット添付を削除します。日程、他のアクティビティ、支出、写真は残ります。',
    conflict:
      'アクティビティまたは日程が変更されました。最新情報を確認してから再確定してください。',
    missing: 'この日程またはアクティビティは存在しません。未送信の入力は以下に残っています。',
    invalid: 'タイトル、種類、24時間表記の時刻、場所の座標を確認してください。',
    limit: 'この日のアクティビティ数が上限に達しました。最新情報を取得して再試行してください。',
  },
};
export function activityRejection(code: string, copy: Copy) {
  if (code === 'ACTIVITY_LIMIT') return copy.limit;
  if (code === 'VALIDATION_ERROR') return copy.invalid;
  if (code === 'NOT_FOUND') return copy.missing;
  if (code === 'FORBIDDEN') return copy.admin;
  return copy.conflict;
}
