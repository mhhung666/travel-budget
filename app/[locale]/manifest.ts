import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Travel Budget App',
    short_name: 'Travel Budget',
    description: 'A simple app to manage travel expenses.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fff',
    theme_color: '#fff',
    icons: [
      {
        src: '/doge.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  }
}
