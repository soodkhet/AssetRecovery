'use client'

import { buttonClass } from '@/components/ui/button'

/**
 * ตาข่ายชั้นสุดท้าย — จับ error ที่เกิดใน root layout เอง (จุดที่ `app/(app)/error.tsx` ไม่ครอบถึง)
 * Next บังคับให้ไฟล์นี้เรนเดอร์ `<html>`/`<body>` เองเพราะ layout ปกติล้มไปแล้ว ⇒ ไม่พึ่ง provider/component ของ UI Kit
 * แต่คลาสปุ่มยังดึงจาก `buttonClass()` (ฟังก์ชันล้วน ไม่ต้องมี context) ให้ขนาด/พื้นที่แตะเท่าปุ่มมาตรฐาน (preship R2-036)
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm font-semibold text-slate-800" role="alert">
            ระบบขัดข้อง
          </p>
          <p className="text-xs text-slate-500">กรุณาโหลดหน้าใหม่ — ถ้ายังไม่ได้ ให้แจ้งผู้ดูแลระบบพร้อมรหัสอ้างอิงด้านล่าง</p>
          {error.digest !== undefined && <p className="font-mono text-[11px] text-slate-400">{error.digest}</p>}
          <button type="button" onClick={reset} className={buttonClass('primary', 'sm', 'mt-1')}>
            ลองใหม่
          </button>
        </main>
      </body>
    </html>
  )
}
