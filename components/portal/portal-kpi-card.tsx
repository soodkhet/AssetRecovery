import type { ReactNode } from 'react'
import Link from 'next/link'
import { RefText, StatCard } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import type { PortalKpiCardModel, PortalKpiTone } from '@/lib/portal/nav'

/** สีตัวเลขของ KPI — ชุดเดียวกับ `kpi()` ใน mockup พอร์ทัล (slate/emerald/amber/blue/red) */
const TONE_VALUE_CLASS: Readonly<Record<PortalKpiTone, string>> = {
  slate: 'text-slate-700',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  blue: 'text-blue-700',
  red: 'text-red-700',
}

const TONE_BORDER_CLASS: Readonly<Record<PortalKpiTone, string>> = {
  slate: 'border-slate-100',
  emerald: 'border-emerald-100',
  amber: 'border-amber-100',
  blue: 'border-blue-100',
  red: 'border-red-100',
}

/** KPI tile ของพอร์ทัล — StatCard ของ UI Kit + สีตามโทน · เงินมาเป็น satang แล้ว format ที่นี่ที่เดียว */
export function PortalKpiTile({
  label,
  value,
  hint,
  tone = 'slate',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: PortalKpiTone
}) {
  return (
    <StatCard
      className={cn('h-full', TONE_BORDER_CLASS[tone])}
      label={label}
      value={<span className={cn('break-words', TONE_VALUE_CLASS[tone])}>{value}</span>}
      hint={hint}
    />
  )
}

/** การ์ด KPI หน้าภาพรวม — คลิกไปหน้าหมวดนั้น */
export function PortalKpiCard({ card }: { card: PortalKpiCardModel }) {
  const { value } = card
  let display: ReactNode
  let hint: ReactNode = card.hint
  switch (value.kind) {
    case 'count':
      display = fmtCount(value.count)
      break
    case 'money':
      display = fmtSatangSymbol(value.satang)
      break
    case 'invoice':
      display = <RefText className="text-lg font-bold text-inherit">{value.invoiceNumber}</RefText>
      hint = `ออกเมื่อ ${fmtDate(value.issueDate)} · ${fmtSatangSymbol(value.totalSatang)}`
      break
    case 'none':
      display = '—'
      break
  }

  return (
    <Link href={card.href} className="focus-ring block rounded-xl transition-opacity hover:opacity-90">
      <PortalKpiTile label={card.label} value={display} hint={hint} tone={card.tone} />
    </Link>
  )
}
