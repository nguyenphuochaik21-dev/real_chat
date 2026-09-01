import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Chatly — Nhắn tin thời gian thực',
    short_name: 'Chatly',
    description: 'Ứng dụng nhắn tin thời gian thực cho bạn bè và nhóm.',
    start_url: '/chats',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f8fafc',
    theme_color: '#7c3aed',
    categories: ['social', 'productivity'],
    icons: [
      {
        src: '/pwa-icon/192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Tin nhắn',
        short_name: 'Tin nhắn',
        url: '/chats',
        icons: [{ src: '/pwa-icon/192', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Bạn bè',
        short_name: 'Bạn bè',
        url: '/contacts',
        icons: [{ src: '/pwa-icon/192', sizes: '192x192', type: 'image/png' }],
      },
    ],
  }
}
