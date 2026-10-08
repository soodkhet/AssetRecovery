'use client'

import { useEffect, useState } from 'react'
import { Button, InlineAlert } from '@/components/ui'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { fmtDate, toInputDate } from '@/lib/format/datetime'
import { closedPeriodChecker, type ClosedPeriodKey } from '@/lib/settings/cycles'

const NOTHING_CLOSED = closedPeriodChecker([])

/**
 * ตัวตอบ "วันตัดรอบ (date-only) อยู่ในงวดที่ปิดแล้วไหม" — โหลดจาก `GET /api/finance/closed-periods` ตอนเปิด modal
 * (preship R7-009 · P11) · ยังไม่โหลด/โหลดไม่สำเร็จ = ถือว่าเปิดทุกงวด (เหมือนเดิม — ยามจริงอยู่ที่ server ตอนสร้าง)
 */
export function useClosedPeriodChecker(open: boolean): (dateOnly: Date) => boolean {
  const [checker, setChecker] = useState<{ isClosed: (dateOnly: Date) => boolean }>({ isClosed: NOTHING_CLOSED })
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const result = await callApi<{ closedPeriods: ClosedPeriodKey[] }>('/api/finance/closed-periods')
      if (!cancelled && result.data !== undefined) setChecker({ isClosed: closedPeriodChecker(result.data.closedPeriods) })
    })()
    return () => {
      cancelled = true
    }
  }, [open])
  return checker.isClosed
}

/** ค่าจาก `<input type="date">` อยู่ในงวดที่ปิดแล้ว — ค่าว่าง/รูปแบบผิด = ไม่ใช่ */
export function isCutoffInClosedPeriod(cutoffDate: string, isClosed: (dateOnly: Date) => boolean): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(cutoffDate) && isClosed(new Date(`${cutoffDate}T00:00:00Z`))
}

/** server ปฏิเสธเพราะวันตัดรอบอยู่ในงวดที่ปิดแล้ว (`PERIOD_LOCKED_DIRECT_EDIT` + `reason`) — preship R7-009 */
export function isClosedPeriodCutoffError(error: ApiCallError | undefined): boolean {
  return error?.code === 'PERIOD_LOCKED_DIRECT_EDIT' && error.payload?.reason === 'cutoff_in_closed_period'
}

/**
 * แจ้งใต้ช่องวันตัดรอบว่างวดของวันที่เลือกปิดแล้ว + ปุ่มใช้วันนี้ — เดิมได้แค่ toast ให้ไปทำ Adjustment
 * (ทางที่ผิด: สร้างรอบใหม่แค่ต้องเลือกวันในงวดที่ยังเปิด) · แสดงทันทีที่เลือกวันในงวดปิด และเมื่อ server ปฏิเสธ
 * · ใช้ร่วมสร้างรอบวางบิล/รอบจ่าย
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
