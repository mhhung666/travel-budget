import { TripSpaceShell } from '@/components/trips/space/TripSpaceShell';

/**
 * 行程空間 layout：行程名頁首 + 分頁列（支出／行程／結算／統計／清單）+
 * 常駐摘要條 + 行動端 FAB，由 TripSpaceShell（client）渲染一次，
 * 分頁切換只換內容區。各子頁 URL 不變。
 */
export default async function TripSpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TripSpaceShell tripId={id}>{children}</TripSpaceShell>;
}
