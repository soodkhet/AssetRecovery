'use client'

/**
 * ตาข่ายชั้นสุดท้าย — จับ error ที่เกิดใน root layout เอง (จุดที่ `app/(app)/error.tsx` ไม่ครอบถึง)
 * Next บังคับให้ไฟล์นี้เรนเดอร์ `<html>`/`<body>` เองเพราะ layout ปกติล้มไปแล้ว ⇒ ใช้ UI Kit ไม่ได้
 * (จึงเป็นข้อยกเว้นเดียวของ Rule 05 ที่เขียนคลาสเอง — คลาสยังยึด `04` §8.1)
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
          <button
            type="button"
            onClick={reset}
            className="focus-ring mt-1 inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
          >
            ลองใหม่
          </button>
        </main>
      </body>
    </html>
  )
}
