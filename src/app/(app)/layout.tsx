import { getCurrentUser } from '@/actions';
import { AppShell } from '@/components/layout/AppShell';

/**
 * App Shell layout：server 端取 session 一次注入 shell，各頁不再自帶
 * Navbar / user 映射 / pt-24。
 *
 * 這裡**不做**登入導向：真正私密的頂層頁（/trips、/settings、/stats、
 * /wrapped）已由 proxy.ts 精確比對保護；而 /map 與 /trips/[id]/* 刻意允許
 * 未登入訪客用 hash_code 公開唯讀檢視（見 hooks/queries/fetcher.ts 的
 * fetchWithPublicFallback 與 /api/public/trips/*）。故 user 可能為 null，
 * 由 AppShell 以訪客模式渲染。
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentUser();
  const user = result.success ? result.data : null;

  return (
    <AppShell
      user={
        user
          ? {
              id: user.id,
              username: user.username,
              display_name: user.display_name,
              email: user.email,
              avatar_url: user.avatar_url,
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
