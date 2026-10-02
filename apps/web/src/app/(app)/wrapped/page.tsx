'use client';

import { WrappedView } from '@/components/wrapped';

// 登入守衛與 user 注入由 (app)/layout.tsx 的 App Shell 處理。
export default function WrappedPage() {
  return <WrappedView />;
}
