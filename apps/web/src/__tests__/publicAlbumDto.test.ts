import { describe, it, expect } from 'vitest';
import { toPublicAlbumPhotoDto } from '@/lib/dto';

/**
 * 公開相簿 DTO 是隱私邊界（PLAN-PHOTOS Phase 4 §8）：漏一個欄位就是位置外洩事故。
 * 這裡把「型別上不可能有位置欄位」再用執行期斷言釘死——即使有人日後在輸入塞了
 * location／exif，輸出也絕不該帶出去。
 */
describe('toPublicAlbumPhotoDto', () => {
  const input = {
    _id: { toString: () => 'photo1' },
    width: 2560,
    height: 1440,
    takenAt: new Date('2026-06-20T08:30:00Z'),
    caption: '晴空塔',
    // 故意混入不該外流的欄位（型別上不存在，用 as 繞過以模擬「呼叫端多給了」）
    location: { lat: 25.03, lon: 121.56, source: 'exif' },
    place: { name: 'Taipei' },
    exif: { make: 'Apple', model: 'iPhone 15 Pro' },
    key: 'photos/trip1/uuid.jpg',
    thumbKey: 'photos/trip1/uuid_t.webp',
    uploadedBy: { toString: () => 'user1' },
    trip: { toString: () => 'trip1' },
  } as unknown as Parameters<typeof toPublicAlbumPhotoDto>[0];

  const dto = toPublicAlbumPhotoDto(input, { url: 'signed-p', thumbUrl: 'signed-t' });

  it('只回允許的欄位（相片＋說明＋日期）', () => {
    expect(Object.keys(dto).sort()).toEqual(
      ['caption', 'height', 'id', 'taken_at', 'thumb_url', 'url', 'width'].sort()
    );
  });

  it('簽好的 URL 直接帶出（呼叫端負責只簽 _p/_t）', () => {
    expect(dto.url).toBe('signed-p');
    expect(dto.thumb_url).toBe('signed-t');
  });

  it('絕不外流位置／相機／key／上傳者／旅程欄位', () => {
    for (const leak of [
      'location',
      'place',
      'exif',
      'key',
      'thumbKey',
      'thumb_key',
      'uploaded_by_id',
      'uploaded_by_name',
      'trip_id',
    ]) {
      expect(dto).not.toHaveProperty(leak);
    }
  });

  it('takenAt → ISO 字串；缺 caption 退空字串', () => {
    expect(dto.taken_at).toBe('2026-06-20T08:30:00.000Z');
    const bare = toPublicAlbumPhotoDto(
      { _id: { toString: () => 'p2' } },
      { url: 'u', thumbUrl: 't' }
    );
    expect(bare.taken_at).toBeNull();
    expect(bare.caption).toBe('');
  });
});
