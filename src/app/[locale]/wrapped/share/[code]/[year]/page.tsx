import { PublicWrappedView } from '@/components/wrapped';

// 年度回顧公開分享頁：去識別化（僅地理 + 年份，無金額）、唯讀，不需登入
// （proxy 的 protectedRoutes 為精確比對，'/wrapped' 不涵蓋此多段路徑）。
export default async function PublicWrappedPage({
  params,
}: {
  params: Promise<{ code: string; year: string }>;
}) {
  const { code, year } = await params;
  return <PublicWrappedView code={code} year={Number(year)} />;
}
