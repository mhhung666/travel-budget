'use server';

import { revalidatePath } from 'next/cache';
import { ItineraryDay, Photo, Trip, User } from '@/models';
import { getTripMembership } from '@/lib/permissions';
import { ensureSanitizedPhotoCopies } from '@/lib/photoSanitize';
import {
  addPhotosSchema,
  updatePhotoSchema,
  deletePhotosSchema,
  PHOTO_LIMIT_PER_TRIP,
  type AddPhotosInput,
  type UpdatePhotoInput,
  type DeletePhotosInput,
  type PhotoItemInput,
} from '@/lib/validation';
import type { ActionResult } from './types';
import type { TripPhoto } from '@/types';
import { withAuth } from './withAuth';
import { logger } from '@/lib/logger';
import { toTripPhotoDto, type TripPhotoDtoInput } from '@/lib/dto';
import {
  isPhotoKeyForTrip,
  sanitizedPhotoKey,
  MAX_PHOTO_BYTES,
  PHOTO_DISPLAY_CONTENT_TYPE,
  PHOTO_THUMB_CONTENT_TYPE,
} from '@/lib/uploads';
import { headObject, deleteObjects, presignGetStable } from '@/lib/storage';

/**
 * 旅程相簿 actions。比照 Note／Checklist 為旅程下的獨立子集合，採**成員信任模型**
 * （任何成員皆可上傳／編輯／刪除）——相簿是共同的回憶，不是誰的私有財產。
 *
 * 相片與收據共用私有 receipts bucket，前綴 `photos/<tripId>/`。**Phase 1 僅成員可讀**：
 * 尚無公開分享路由。將來要做（Phase 4）時，公開路由只可簽剝除 APP1 的消毒副本
 * `_p.jpg` 與縮圖 `_t.webp`，**絕不可簽 `.jpg`**——顯示檔自帶公尺級 GPS。
 */

/** 簽發相簿 DTO 需要的兩張穩定 URL。 */
async function signPhotoUrls(p: { key: string; thumbKey: string }) {
  const [url, thumbUrl] = await Promise.all([
    presignGetStable('receipts', p.key),
    presignGetStable('receipts', p.thumbKey),
  ]);
  return { url, thumbUrl };
}

/**
 * 取得旅程相簿（拍攝時間新到舊——與索引同序）。
 *
 * URL 在這裡就簽好隨 DTO 一起回：一頁幾十張，若比照收據「檢視時才簽」就會變成
 * 每張一次 action 呼叫。presign 是純 HMAC 計算、沒有網路往返，一次簽數百張的成本
 * 可忽略。用 presignGetStable 而非 presignGet，否則每次瀏覽都是新 URL，SW 的
 * CacheFirst 永遠 miss 且無限膨脹（見 storage.ts）。
 */
export const getTripPhotos = withAuth(
  async (session, tripIdOrCode: string): Promise<ActionResult<TripPhoto[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const photos = await Photo.find({ trip: membership.tripId })
        .sort({ takenAt: -1, createdAt: -1 })
        .lean<(TripPhotoDtoInput & { key: string; thumbKey: string })[]>();

      const dtos = await Promise.all(
        photos.map(async (p) => toTripPhotoDto(p, await signPhotoUrls(p)))
      );

      return { success: true, data: dtos };
    } catch (error) {
      logger.error('Get photos error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 驗證一張相片的兩顆物件真的存在、屬於本 trip、且型別/大小合規。
 *
 * 為什麼非驗不可：presigned PUT **無法限制 client 實際送出的內容**——拿到簽名後大可
 * PUT 一個 50MB 的任意檔案上去。所以「存參照」這一步必須以 headObject 回頭核對真實
 * 物件（比照 resolveNoteAttachments）。型別是逐顆比對的：顯示檔必為 JPEG、縮圖必為
 * WebP，key 的副檔名寫死，型別對不上就是名實不符。
 *
 * 不合格回 null（整張拒收）——這裡與 EXIF 欄位的「丟掉該欄位」不同：key 錯了就沒有
 * 相片可言。
 */
async function verifyPhotoObjects(
  tripId: string,
  item: PhotoItemInput
): Promise<{ size: number; contentType: string } | null> {
  if (!isPhotoKeyForTrip(tripId, item.key) || !isPhotoKeyForTrip(tripId, item.thumb_key)) {
    return null;
  }
  // 顯示檔與縮圖必須是同一張相片的兩顆物件（共用 uuid），否則 client 可以把 A 的縮圖
  // 配上 B 的顯示檔。key 規則見 buildPhotoObjectKeys。
  if (item.thumb_key !== item.key.replace(/\.jpg$/, '_t.webp')) {
    return null;
  }

  const [display, thumb] = await Promise.all([
    headObject('receipts', item.key),
    headObject('receipts', item.thumb_key),
  ]);
  if (!display || !thumb) return null;
  if (display.contentType !== PHOTO_DISPLAY_CONTENT_TYPE) return null;
  if (thumb.contentType !== PHOTO_THUMB_CONTENT_TYPE) return null;
  if (display.size > MAX_PHOTO_BYTES || thumb.size > MAX_PHOTO_BYTES) return null;
  if (display.size <= 0 || thumb.size <= 0) return null;

  return display;
}

/**
 * 把一批已直傳 R2 的相片存進資料庫。
 *
 * 一次收一批（前端一次挑 20 張就是 20×2 個 headObject，但只有一次 DB round trip）。
 * `place`（反查地名）Phase 1 一律留 null——見 models/Photo.ts 的說明。
 */
export const addTripPhotos = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: AddPhotosInput
  ): Promise<ActionResult<TripPhoto[]>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = addPhotosSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }
      const { items } = validation.data;

      // 軟上限：擋住失控成長，但不動既有相片（R2 超額是 $0.015/GB/月，真正的風險是
      // 失控而非單價）。回 CONFLICT 而非 VALIDATION_ERROR，前端才能把「相簿滿了」
      // 對應到專屬訊息而不是通用的「輸入有誤」。
      const existing = await Photo.countDocuments({ trip: membership.tripId });
      if (existing + items.length > PHOTO_LIMIT_PER_TRIP) {
        return { success: false, error: '相簿相片數已達上限', code: 'CONFLICT' };
      }

      const heads = await Promise.all(
        items.map((item) => verifyPhotoObjects(membership.tripId, item))
      );
      if (heads.some((h) => h === null)) {
        return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
      }

      // 去正規化上傳者名稱（上傳當下快照，讀取免 populate，比照 note.actions.ts）
      const uploader = await User.findById(session.userId)
        .select('displayName')
        .lean<{ displayName: string } | null>();

      const docs = items.map((item, i) => ({
        trip: membership.tripId,
        key: item.key,
        thumbKey: item.thumb_key,
        contentType: heads[i]!.contentType,
        size: heads[i]!.size,
        width: item.width ?? 0,
        height: item.height ?? 0,
        takenAt: item.taken_at ? new Date(item.taken_at) : null,
        // EXIF 有 GPS 就標 'exif'。沒有就是 null——Phase 1 不做「退回行程日座標」
        // （那要等 Phase 2 的行程日關聯才有得退）。
        location: item.location ? { ...item.location, source: 'exif' as const } : null,
        place: null,
        exif: {
          make: item.exif?.make,
          model: item.exif?.model,
          lens: item.exif?.lens,
          iso: item.exif?.iso,
          fNumber: item.exif?.f_number,
          exposureTime: item.exif?.exposure_time,
          focalLength: item.exif?.focal_length,
          orientation: item.exif?.orientation,
        },
        itineraryDay: null,
        caption: item.caption ?? '',
        uploadedBy: session.userId,
        uploadedByName: uploader?.displayName ?? '',
      }));

      const created = await Photo.insertMany(docs);

      // 若相簿已公開分享，補產這批新相片的消毒副本 `_p.jpg`，讓公開頁立刻能顯示它們
      // （否則要等下一位訪客觸發 self-heal）。best-effort：失敗只 log，不擋上傳成功。
      const trip = await Trip.findById(membership.tripId)
        .select('albumShareCode')
        .lean<{ albumShareCode?: string | null }>();
      if (trip?.albumShareCode) {
        await ensureSanitizedPhotoCopies(membership.tripId).catch((e) =>
          logger.error('Add photos: sanitize top-up failed', e)
        );
      }

      const dtos = await Promise.all(
        created.map(async (doc) => {
          const obj = doc.toObject() as unknown as TripPhotoDtoInput & {
            key: string;
            thumbKey: string;
          };
          return toTripPhotoDto(obj, await signPhotoUrls(obj));
        })
      );

      revalidatePath(`/trips/${tripIdOrCode}/album`);
      return { success: true, data: dtos };
    } catch (error) {
      logger.error('Add photos error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 關聯／解除行程日時，這張相片的座標該變成什麼。回 `undefined`＝不要動它。
 *
 * 規則的核心是**精確度只能往上、不能被覆蓋**：相片自己的 GPS（`exif`）與使用者親手拉的
 * 釘（`manual`）都比「整天共用一顆城市座標」精確，關聯行程日不該把它們蓋掉。只有
 * 「本來就沒座標」或「座標本來就是上一個行程日借來的」才跟著換。
 *
 * 反向也要成立：解除關聯（或換到一個沒設地點的行程日）時，借來的座標要跟著消失，
 * 否則地圖上會留下一顆沒有任何來源可解釋的釘子。
 */
function deriveItineraryLocation(
  current: { source?: string | null } | null | undefined,
  dayLocation: { lat?: number | null; lon?: number | null } | null | undefined
): { lat: number; lon: number; source: 'itinerary' } | null | undefined {
  if (current && current.source !== 'itinerary') return undefined;

  const { lat, lon } = dayLocation ?? {};
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    // 沒得借：把上一個行程日借來的座標收回（本來就沒座標則為 no-op）
    return current ? null : undefined;
  }
  return { lat, lon, source: 'itinerary' };
}

/**
 * 更新一張相片（說明／關聯行程日／手動拉釘）。成員信任：不檢查上傳者，比照隨手記。
 *
 * 手動拉釘會把 `location.source` 標成 `'manual'`——source 讓「這張為什麼釘在這」
 * 可解釋，別讓手動座標偽裝成 EXIF 的精確座標。關聯行程日時的座標退回規則見
 * deriveItineraryLocation；呼叫端明確給了 `location` 時以它為準（手動優先）。
 */
export const updatePhoto = withAuth(
  async (
    session,
    tripIdOrCode: string,
    photoId: string,
    input: UpdatePhotoInput
  ): Promise<ActionResult<TripPhoto>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = updatePhotoSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }

      const { caption, itinerary_day_id, location } = validation.data;
      const set: Record<string, unknown> = {};
      if (caption !== undefined) set.caption = caption;
      if (location !== undefined) {
        set.location = location ? { ...location, source: 'manual' as const } : null;
      }
      if (itinerary_day_id !== undefined) {
        let dayLocation: { lat?: number | null; lon?: number | null } | null = null;
        if (itinerary_day_id === null) {
          set.itineraryDay = null;
        } else {
          // 行程日必須屬於本 trip——否則成員可以把相片掛到別團的行程日上。
          // 取 location 是為了下面的座標退回（沒有 GPS 的相片借當天的城市座標）。
          const day = await ItineraryDay.findOne({
            _id: itinerary_day_id,
            trip: membership.tripId,
          })
            .select('location')
            .lean<{ location?: { lat?: number | null; lon?: number | null } | null } | null>();
          if (!day) {
            return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
          }
          set.itineraryDay = itinerary_day_id;
          dayLocation = day.location ?? null;
        }

        // 同一次呼叫明確拉了釘就以它為準，別讓退回規則蓋掉使用者剛拉的座標。
        // `location: null`（明確清掉手動釘）不算數——清掉後這張就沒有座標了，正好可以借當天的。
        if (!location) {
          // location === null 時現有座標已經要被清掉，不必回頭讀
          const current =
            location === null
              ? null
              : await Photo.findOne({ _id: photoId, trip: membership.tripId })
                  .select('location')
                  .lean<{ location?: { source?: string | null } | null } | null>();
          if (location === undefined && !current) {
            return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
          }
          const derived = deriveItineraryLocation(current?.location, dayLocation);
          if (derived !== undefined) set.location = derived;
        }
      }

      const updated = await Photo.findOneAndUpdate(
        { _id: photoId, trip: membership.tripId },
        { $set: set },
        { new: true }
      ).lean<(TripPhotoDtoInput & { key: string; thumbKey: string }) | null>();
      if (!updated) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      revalidatePath(`/trips/${tripIdOrCode}/album`);
      return { success: true, data: toTripPhotoDto(updated, await signPhotoUrls(updated)) };
    } catch (error) {
      logger.error('Update photo error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);

/**
 * 刪除一批相片＋其 R2 物件。**單張刪除也走這裡**（前端傳一個元素的陣列）：批次選取
 * 一次刪 50 張若逐張呼叫就是 50 次 action＋50 次 deleteObjects，與 repo 避免 N+1 的
 * 慣例相悖；反過來讓單張走批次路徑則毫無代價。
 *
 * 同現行 no-cascade 契約：blob 是 **best-effort 刪除**（失敗只 log，不讓使用者的刪除
 * 操作失敗），所有 key 一次 deleteObjects 收掉。
 *
 * 也一併刪 `_p.jpg`（消毒副本）：Phase 1／2 還不會產生它，但先寫進來，免得 Phase 4
 * 上線後忘了補而留下永久孤兒（刪不存在的 key 對 S3/R2 是 no-op，不會失敗）。
 */
export const deletePhotos = withAuth(
  async (
    session,
    tripIdOrCode: string,
    input: DeletePhotosInput
  ): Promise<ActionResult<{ deleted: number }>> => {
    try {
      const membership = await getTripMembership(session.userId, tripIdOrCode);
      if (!membership) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      const validation = deletePhotosSchema.safeParse(input);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error.issues[0].message,
          code: 'VALIDATION_ERROR',
        };
      }
      const { photo_ids } = validation.data;

      // trip 條件是歸屬把關：別團的 id 混進來只會查不到，不會被刪。
      const docs = await Photo.find({ _id: { $in: photo_ids }, trip: membership.tripId })
        .select('key thumbKey')
        .lean<{ key: string; thumbKey: string }[]>();
      if (docs.length === 0) {
        return { success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' };
      }

      await Photo.deleteMany({ _id: { $in: photo_ids }, trip: membership.tripId });

      const keys = docs.flatMap((d) => [d.key, d.thumbKey, sanitizedPhotoKey(d.key)]);
      await deleteObjects('receipts', keys).catch((e) =>
        logger.error('Delete photos: blob cleanup failed', e)
      );

      revalidatePath(`/trips/${tripIdOrCode}/album`);
      return { success: true, data: { deleted: docs.length } };
    } catch (error) {
      logger.error('Delete photos error', error);
      return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
    }
  }
);
