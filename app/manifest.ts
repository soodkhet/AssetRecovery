import type { MetadataRoute } from 'next'

/**
 * Web App Manifest ของ PWA ภาคสนาม (`41` §15)
 *
 * `start_url` = `/field` เพราะคนที่ "เพิ่มลงหน้าจอโฮม" คือพนักงานภาคสนาม (คนอื่นใช้ผ่านเบราว์เซอร์ปกติ)
 * iOS ต้องติดตั้งผ่าน A2HS ก่อนจึงจะได้ Web Push — แบนเนอร์แนะนำอยู่ที่ `components/field/pwa-provider.tsx`
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AssetRecovery — ติดตามภาคสนาม',
    short_name: 'AssetRecovery',
    description: 'แอปงานภาคสนามสำหรับพนักงานติดตามทรัพย์',
    start_url: '/field',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    lang: 'th',
    icons: [
      { src: '/icons/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      // PNG สำหรับ Android/Chrome ที่ต้องการขนาดตายตัว · maskable = ไอคอน 80% กลางพื้นสีเดียวกัน (อยู่ใน safe zone)
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
