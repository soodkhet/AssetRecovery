import { StatusBadge } from '@/components/ui/badge'
import type { BillingBatchStatus } from '@/lib/generated/prisma/enums'
import { billingStatusView, DEBIT_NOTE_OUTSTANDING_LABEL } from '@/lib/revenue/revenue-ui'

/**
 * ป้ายสถานะรอบวางบิล (หน้าภายใน) — สะท้อน**ยอดตามเอกสาร** (มติ O74): รอบ `paid` ที่ยังค้างจากใบเพิ่มหนี้
 * แสดงเป็น "รับชำระบางส่วน" + ป้ายเสริม "มีใบเพิ่มหนี้ค้าง" · ป้ายเดียวกับพอร์ทัล (`billingStatusView()`)
 * · `outstandingSatang` มาจาก API (ยอดตามเอกสาร) — ไม่คิดเงินที่นี่
 */
export function BillingStatusBadge({ status, outstandingSatang }: { status: BillingBatchStatus; outstandingSatang: number }) {
  const view = billingStatusView(status, outstandingSatang)
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <StatusBadge status={view.displayStatus} group={view.group} label={view.label} />
      {view.debitNoteOutstanding && <StatusBadge group="pending" label={DEBIT_NOTE_OUTSTANDING_LABEL} />}
    </span>
  )
}
