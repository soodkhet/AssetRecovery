import type { Metadata } from 'next'
import { Inter, Noto_Sans_Thai } from 'next/font/google'
import { APP_NAME } from '@/lib/constants'
import './globals.css'

/**
 * Font มาตรฐานทั้งระบบ — Inter (อังกฤษ/ตัวเลข) + Noto Sans Thai (ไทย) fallback `sans-serif` (`04` §8.1)
 * โหลดผ่าน `next/font` (self-host ตอน build) แทน `<link>` ไป Google Fonts — ไม่มี request ออกนอกตอน runtime
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const notoSansThai = Noto_Sans_Thai({ subsets: ['thai'], variable: '--font-noto-sans-thai', display: 'swap' })

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Operations Platform สำหรับธุรกิจรับจ้างติดตามทรัพย์คืนจากลูกหนี้ให้บริษัทไฟแนนซ์',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={`${inter.variable} ${notoSansThai.variable}`}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  )
}
