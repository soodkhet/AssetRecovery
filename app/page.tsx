import { APP_NAME } from '@/lib/constants'

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">{APP_NAME} — Staging OK</h1>
        <p className="mt-2 text-xs text-slate-600">
          โครงโปรเจกต์พร้อมใช้งาน (Phase 0.1) — หน้าจอจริงเริ่มที่ Phase 1.5 (UI Kit + App Shell)
        </p>
      </div>
    </main>
  )
}
