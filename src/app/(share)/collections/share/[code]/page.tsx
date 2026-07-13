import { PublicCollectionsView } from '@/components/collections';

// 成就徽章公開分享卡：去識別化（僅徽章 + 彙總數量，無逐筆紀錄）、唯讀，不需登入
// （proxy 的 protectedRoutes 為精確比對，'/collections' 不涵蓋此多段路徑）。
export default async function PublicCollectionsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PublicCollectionsView code={code} />;
}
