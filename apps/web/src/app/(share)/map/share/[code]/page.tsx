import { PublicMapView } from '@/components/map';

// 旅行地圖公開分享頁：去識別化、唯讀，不需登入（proxy 未把 /map/share 列入保護路由）。
export default async function PublicMapPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PublicMapView code={code} />;
}
