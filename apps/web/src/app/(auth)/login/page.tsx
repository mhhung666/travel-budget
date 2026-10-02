import { redirect } from '@/i18n/navigation';

// 登入表單在首頁（HomePage 內嵌），這裡只轉導；保留 ?redirect= 讓
// 登入後能回到原頁（例如 /join/[hashCode]）。
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: target } = await searchParams;
  redirect(target ? `/?redirect=${encodeURIComponent(target)}` : '/');
}
