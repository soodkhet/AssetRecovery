import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { STATUS_BADGE_CLASS, statusBadgeClass, type StatusBadgeGroup } from '@/lib/ui/status-badge'

/**
 * Badge สถานะ — สีมาจาก mapper กลางเท่านั้น (`04` §8.1 10 กลุ่ม · ห้ามใช้สีสุ่มนอกระบบ `04` §10)
 *
 * ปกติส่ง `status` (ค่า enum จาก `02` §3) แล้วให้ mapper เลือกสีให้
 * ถ้าโมดูลมีสถานะที่ mapper ยังไม่รู้จัก ให้ระบุ `group` ตรง ๆ — ห้ามส่งคลาสสีเอง
 */
export function StatusBadge({
  status,
  group,
  label,
  className,
}: {
  status?: string | null
  group?: StatusBadgeGroup
  /** ข้อความที่แสดง — ไม่ระบุ = ใช้ค่า `status` ดิบ (โมดูลควรส่งชื่อสถานะภาษาไทยมาเสมอ) */
  label?: ReactNode
  className?: string
}) {
  const colorClass = group === undefined ? statusBadgeClass(status) : STATUS_BADGE_CLASS[group]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        colorClass,
        className,
      )}
    >
      {label ?? status ?? '—'}
    </span>
  )
}

/** ป้ายกำกับทั่วไป (ไม่ใช่สถานะ) — เช่น "Seed", "รอบ 08/2569" */
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** ข้อความรหัส/เลขอ้างอิง (case ref, IMEI, เลขบัญชี, เลขภาษี) — บังคับ `font-mono` (`04` §8.1) */
export function RefText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-xs text-slate-700', className)}>{children}</span>
}
