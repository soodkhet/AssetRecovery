import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'

/** Card/Panel — `bg-white rounded-xl border border-slate-200 shadow-sm p-6` (`04` §8.1) */
export function Card({
  className,
  padded = true,
  children,
}: {
  className?: string
  /** `false` = ไม่ใส่ padding (ใช้เมื่อภายในเป็นตารางเต็มความกว้าง) */
  padded?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', padded && 'p-6', className)}>
      {children}
    </div>
  )
}

/** หัว Card — ชื่อเรื่อง + คำอธิบาย + ปุ่มมุมขวา */
export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {description !== undefined && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      {action !== undefined && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

/** หัวหน้าจอมาตรฐาน: Page → Header → Tabs/Filters → Table/KPI (`04` §9) */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        {description !== undefined && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action !== undefined && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

/** KPI tile เล็ก ๆ ที่ mockup ใช้ซ้ำทุกโมดูล — ค่าเงินต้อง format ผ่าน `fmtSatang()` มาก่อนเสมอ */
export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white p-4 shadow-sm', className)}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
      {hint !== undefined && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  )
}
