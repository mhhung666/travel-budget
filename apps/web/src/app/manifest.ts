import { MetadataRoute } from 'next';
import { ROUTES } from '@/constants/routes';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '旅行記帳 Travel Budget',
    short_name: '旅行記帳',
    description: '輕量化的旅行記帳與分帳應用程式',
    // 安裝身分與起始頁固定在原點。
    id: '/',
    start_url: '/',
    // scope 固定為來源網域根目錄,PWA 安裝後所有路徑都留在 standalone。
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    // 長按 App 圖示的快速捷徑(Android / 部分桌面平台)。
    shortcuts: [
      {
        // 記帳 PWA 最有價值的捷徑：直達最近行程的新增支出(Phase 4)。
        name: '記一筆',
        url: ROUTES.QUICK_ADD,
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: '我的行程',
        url: ROUTES.TRIPS,
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: '旅行地圖',
        url: ROUTES.MAP,
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: '消費統計',
        url: ROUTES.STATS,
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
    icons: [
      // Explicit 192/512 raster sizes so Android treats the app as installable.
      // `purpose: any` only — the logo isn't designed with a maskable safe zone,
      // so declaring it maskable would let the launcher crop it badly.
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
