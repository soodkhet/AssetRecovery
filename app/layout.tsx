import type { Metadata, Viewport } from 'next'
import { Sarabun } from 'next/font/google'
import { APP_NAME } from '@/lib/constants'
import './globals.css'

/**
 * Font มาตรฐานทั้งระบบ — Sarabun ทั้งไทยและอังกฤษ (มติผู้ใช้ 19–20/10/2569 แทน Inter + Noto Sans Thai) fallback `sans-serif` (`04` §8.1)
 * เลขอ้างอิง/ยอดเงินยังใช้ `font-mono` (ไทยในช่องนั้น fallback เป็น Sarabun — `globals.css`)
 * Sarabun ไม่ใช่ variable font ⇒ ต้องระบุ weight ที่ใช้ (400–700 ตาม UI Kit + 800 ของ `font-extrabold`)
 * โหลดผ่าน `next/font` (self-host ตอน build) แทน `<link>` ไป Google Fonts — ไม่มี request ออกนอกตอน runtime
 */
const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sarabun',
  display: 'swap',
})

export const metadata: Metadata = {
  // ชื่อแท็บตามหน้า: แต่ละ page.tsx ตั้ง `metadata.title` เป็นชื่อหน้า (ชื่อเดียวกับเมนู/หัวหน้า) — staging S-009
  title: { template: `%s — ${APP_NAME}`, default: APP_NAME },
  description: 'Operations Platform สำหรับธุรกิจรับจ้างติดตามทรัพย์คืนจากลูกหนี้ให้บริษัทไฟแนนซ์',
  // PWA ของงานภาคสนาม (`41` §15) — iOS ต้อง "เพิ่มลงหน้าจอโฮม" ก่อนถึงจะได้ Web Push
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default' },
  // iOS ไม่ใช้ SVG เป็น apple-touch-icon ⇒ PNG 180 พื้นทึบ (iOS ปัดมุมเอง) · favicon.ico (32+48) กัน /favicon.ico 404
  // PNG ทั้งหมดเรนเดอร์จาก public/icons/app-icon.svg — แก้โลโก้ต้องเรนเดอร์ใหม่ทุกขนาด (staging S-006)
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32 48x48' },
      { url: '/icons/app-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  )
}
