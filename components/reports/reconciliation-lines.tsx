import { cn } from '@/components/ui/cn'
import { reconciliationTextLines } from '@/lib/reports/export'
import type { ReportReconciliation } from '@/lib/reports/payload'

/**
 * บรรทัดกระทบยอดใต้ตารางรายงาน (มติ PO 05/10/2569 U44) — ข้อความ/ยอดมาจาก `reconciliationTextLines()`
 * ชุดเดียวกับ PDF · ไม่ลง ⇒ ไฮไลต์ผลต่างเป็นสีเตือน (ไม่คำนวณเงินบนจอ — Rule 01)
 */
export function ReconciliationLines({ reconciliation }: { reconciliation: ReportReconciliation }) {
  const lines = reconciliationTextLines({ reconciliation })
  return (
    <section
      aria-label={reconciliation.title}
      className={cn(
        'rounded-lg border p-4 text-xs',
        reconciliation.balanced ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50',
      )}
    >
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{reconciliation.title}</h3>
      <dl className="space-y-1">
        {lines.map((line) => (
          <div
            key={line.label}
            className={cn(
              'flex items-center justify-between gap-4',
              line.emphasis && 'border-t border-slate-200 pt-1 font-semibold text-slate-900',
            )}
          >
            <dt className="text-slate-600">{line.label}</dt>
            <dd className="font-mono text-slate-800 tabular-nums">{line.amount}</dd>
          </div>
        ))}
      </dl>
      {reconciliation.note !== undefined && (
        <p className={cn('mt-2', reconciliation.balanced ? 'text-slate-500' : 'text-amber-700')}>
          {reconciliation.note}
        </p>
      )}
    </section>
  )
}
