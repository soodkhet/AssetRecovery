'use client'

import { Button, InlineAlert } from '@/components/ui'
import type { ApiCallError } from '@/lib/api/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'

/** server ปฏิเสธเพราะวันตัดรอบอยู่ในงวดที่ปิดแล้ว (`PERIOD_LOCKED_DIRECT_EDIT` + `reason`) — preship R7-009 */
export function isClosedPeriodCutoffError(error: ApiCallError | undefined): boolean {
  return error?.code === 'PERIOD_LOCKED_DIRECT_EDIT' && error.payload?.reason === 'cutoff_in_closed_period'
}

/**
 * แจ้งใต้ช่องวันตัดรอบว่างวดของวันที่เลือกปิดแล้ว + ปุ่มใช้วันนี้ — เดิมได้แค่ toast ให้ไปทำ Adjustment
 * (ทางที่ผิด: สร้างรอบใหม่แค่ต้องเลือกวันในงวดที่ยังเปิด) · ใช้ร่วมสร้างรอบวางบิล/รอบจ่าย
 */
export function ClosedPeriodCutoffAlert({ onUseToday }: { onUseToday: (today: string) => void }) {
  const today = toInputDate(new Date())
  return (
    <InlineAlert tone="warning" title="วันตัดรอบอยู่ในงวดที่ปิดแล้ว">
      <p>งวดบัญชีของวันที่เลือกปิดแล้ว — เลือกวันตัดรอบในงวดที่ยังเปิดอยู่ แล้วกดสร้างอีกครั้ง</p>
      <Button size="sm" variant="secondary" className="mt-2" onClick={() => onUseToday(today)}>
        ใช้วันนี้ ({fmtDate(`${today}T00:00:00Z`)})
      </Button>
    </InlineAlert>
  )
}
