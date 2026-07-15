import { PublicAlbumView } from '@/components/album/PublicAlbumView';

// 旅程相簿公開分享頁：純相片牌（相片＋說明＋日期＋旅程名，無位置），唯讀、不需登入
// （proxy 的 protectedRoutes 為精確比對，'/album/share/[code]' 多段路徑不涵蓋即維持公開）。
export default async function PublicAlbumPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PublicAlbumView code={code} />;
}
