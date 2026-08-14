import type { ReactNode } from 'react'
import { Spinner } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'

/**
 * Loading / Empty / Error state — **ทุกหน้าต้องมีครบทั้งสาม** (`04` §9)
 * ใช้ตัวเดียวกันทั้งในการ์ด, ในตาราง (ผ่าน `<TableState>`) และเต็มหน้า
 */

function StateShell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      {children}
    </div>
  )
}

export function LoadingState({ message = 'กำลังโหลดข้อมูล...', className }: { message?: string; className?: string }) {
  return (
    <StateShell className={className}>
      <Spinner className="h-5 w-5 text-slate-400" />
      <p className="text-xs text-slate-500" role="status">
        {message}
      </p>
    </StateShell>
  )
}

export function EmptyState({
  title = 'ยังไม่มีข้อมูล',
  description,
  action,
  className,
}: {
  title?: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <StateShell className={className}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
          />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description !== undefined && <p className="max-w-md text-xs text-slate-500">{description}</p>}
      {action !== undefined && <div className="mt-1">{action}</div>}
    </StateShell>
  )
}

export function ErrorState({
  title = 'โหลดข้อมูลไม่สำเร็จ',
  message = 'เกิดข้อผิดพลาดระหว่างดึงข้อมูล กรุณาลองใหม่อีกครั้ง',
  code,
  action,
  className,
}: {
  title?: string
  message?: ReactNode
  /** error code จาก `24` (ถ้ามี) — ช่วยให้ผู้ใช้แจ้งปัญหาได้ตรงจุด */
  code?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <StateShell className={className}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-800" role="alert">
        {title}
      </p>
      <p className="max-w-md text-xs text-slate-500">{message}</p>
      {code !== undefined && <p className="font-mono text-[11px] text-slate-400">{code}</p>}
      {action !== undefined && <div className="mt-1">{action}</div>}
    </StateShell>
  )
}

/** แถบแจ้งเตือนแบบ inline (ไม่ block) — ใช้กับ warning 4 ตัวของ `24` ที่ "เตือนแต่ไม่ reject" */
export function InlineAlert({
  tone = 'warning',
  title,
  children,
  className,
}: {
  tone?: 'warning' | 'error' | 'info' | 'success'
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const toneClass = {
    warning: 'border-orange-200 bg-orange-50 text-orange-800',
    error: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }[tone]

  return (
    <div className={cn('rounded-lg border px-3 py-2.5 text-xs', toneClass, className)} role="alert">
      {title !== undefined && <div className="font-semibold">{title}</div>}
      {children !== undefined && <div className={cn(title !== undefined && 'mt-0.5')}>{children}</div>}
    </div>
  )
}

/** โครงกระดูกระหว่างโหลด (ใช้กับ layout ที่รู้รูปร่างล่วงหน้า) */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} aria-hidden="true" />
}
