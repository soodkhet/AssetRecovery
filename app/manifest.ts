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
      { src: '/icons/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}
