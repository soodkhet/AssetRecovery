import type { Metadata } from 'next'
import { APP_NAME } from '@/lib/constants'
import './globals.css'

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Operations Platform สำหรับธุรกิจรับจ้างติดตามทรัพย์คืนจากลูกหนี้ให้บริษัทไฟแนนซ์',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  )
}
