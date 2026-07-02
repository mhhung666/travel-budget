import { getCurrentUser } from '@/actions';
import { PublicShell } from '@/components/layout/PublicShell';

/**
 * 免登入邀請頁（join / link-virtual）的唯讀殼。
 * 只需知道「是否已登入」來切換 CTA；分享頁（map/wrapped share）為全螢幕
 * 自帶版面，屬 (share) group、不掛此殼。
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentUser();
  const loggedIn = !!(result.success && result.data);

  return <PublicShell loggedIn={loggedIn}>{children}</PublicShell>;
}
