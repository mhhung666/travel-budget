import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Travel Budget App',
    short_name: 'Travel Budget',
    description: 'A simple app to manage travel expenses.',
    // 安裝身分與起始頁固定在原點。
    id: '/',
    start_url: '/',
    // 明確宣告 scope 涵蓋整個來源網域：localePrefix 'as-needed' 下切換到非預設語言
    // 會導向 /en/... 等帶前綴路徑，若 scope 缺省，iOS 會以 manifest 所在路徑
    // （/zh/manifest.webmanifest）推斷出 /zh/ 作用域，導致切語言時被踢出 standalone
    // 到 Safari in-app 瀏覽器。設為 '/' 讓所有語言路徑都留在 PWA 內。
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
    ],
  };
}
