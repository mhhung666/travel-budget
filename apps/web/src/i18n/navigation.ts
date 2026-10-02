// 改用 next-intl「無 i18n 路由」後，網址不含語言前綴，導航不需處理 locale。
// 維持從 '@/i18n/navigation' 匯入的慣例（多個元件沿用），底層改接原生 next 導航。
export { default as Link } from 'next/link';
export { useRouter, usePathname, redirect } from 'next/navigation';
