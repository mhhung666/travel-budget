import { redirect } from '@/i18n/navigation';
import { getCurrentUser } from '@/actions';
import { AppShell } from '@/components/layout/AppShell';

/**
 * 登入後的 App Shell layout：server 端取 session（與 proxy.ts 的保護互補，
 * 涵蓋 /trips/[id]/* 等 proxy 精確比對不到的巢狀路徑），user 一次注入 shell，
 * 各頁不再自帶 Navbar / user 映射 / pt-24。
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentUser();
  const user = result.success ? result.data : null;

  if (!user) {
    redirect('/login');
  }

  return (
    <AppShell
      user={{
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
        avatar_url: user.avatar_url,
      }}
    >
      {children}
    </AppShell>
  );
}
