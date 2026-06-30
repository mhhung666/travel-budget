import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Travel Budget App',
    short_name: 'Travel Budget',
    description: 'A simple app to manage travel expenses.',
    // 安裝身分與起始頁固定在原點。
    id: '/',
    start_url: '/',
    // scope 固定為來源網域根目錄，PWA 安裝後所有路徑都留在 standalone。
    scope: '/',
    display: 'standalone',
    background_color: '#fff',
    theme_color: '#fff',
    icons: [
      {
        src: '/take-my-money.png',
        sizes: 'any',
        type: 'image/png',
      },
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
