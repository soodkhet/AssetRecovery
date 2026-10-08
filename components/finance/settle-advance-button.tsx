'use client'

import { Button } from '@/components/ui'
import { canSettleAdvance, settleBlockedReason } from '@/lib/advances/advance-ui'
import type { AdvanceDto } from '@/lib/advances/types'

/**
 * ปุ่ม "เคลียร์ยอด" เงินทดรอง — ใช้ร่วมหน้าการเงิน (แท็บเงินทดรอง/คิวอนุมัติ) และหน้า Field Tracker
 *
 * - สถานะเคลียร์ไม่ได้ตาม state machine ⇒ ไม่แสดงปุ่ม
 * - มติ PO U74: เงินทดรองอยู่ในรอบจ่ายที่ยังไม่ยืนยันโอน ⇒ **ปิดปุ่ม + บอกเหตุผล (ชื่อรอบจ่าย)**
 *   ฝั่ง API ปฏิเสธ `ADVANCE_IN_PENDING_PAYOUT` อยู่แล้ว — ปุ่มนี้เป็นแค่ UX
 */
export function SettleAdvanceButton({
  advance,
  onSettle,
}: {
  advance: AdvanceDto
  onSettle: (advance: AdvanceDto) => void
}) {
  if (!canSettleAdvance(advance.status)) return null
  const blocked = settleBlockedReason(advance)
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={blocked !== null}
        title={blocked ?? undefined}
        onClick={() => onSettle(advance)}
      >
        เคลียร์ยอด
      </Button>
      {blocked !== null && (
        // ตัดบรรทัดเสมอ — เดิมสืบ whitespace-nowrap ของช่องจัดการ ทำให้ตารางเงินทดรองกว้างเกินจอ 1280 (preship R6-005)
        <span className="max-w-[11rem] text-right text-[10px] whitespace-normal text-amber-700">{blocked}</span>
      )}
    </span>
  )
}
