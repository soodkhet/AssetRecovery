'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import type { BillingBatchPreviewDto } from '@/lib/revenue/types'

/**
 * staging E-049 / mytester G-05 — สรุปก่อนกดสร้างรอบวางบิล: วันตัดรอบนี้ดึงรายได้กี่รายการ ยอดเท่าไร
 * + รายได้ที่รอวางบิลแต่อยู่หลังวันตัดรอบ (ตัวคัดเดียวกับตอนสร้างจริง — `GET /api/billing-batches/preview`)
 * วันที่เสนอไม่มีรายได้แต่มีรายได้หลังจากนั้น ⇒ ปุ่ม "ใช้วันนี้เป็นวันตัดรอบ" (ค่าเริ่มต้นยังตามรอบบิล — U146)
 */
export function BillingPreview({
  companyId,
  cutoffDate,
  today,
  onUseToday,
}: {
  companyId: string
  cutoffDate: string
  /** `YYYY-MM-DD` วันนี้ (เวลาไทย) */
  today: string
  onUseToday: (date: string) => void
}) {
  const [preview, setPreview] = useState<{ key: string; data: BillingBatchPreviewDto | null; error: string | null } | null>(
    null,
  )
  const valid = companyId !== '' && /^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)
  const key = `${companyId}|${cutoffDate}`

  useEffect(() => {
    if (!valid) return
    let cancelled = false
    void (async () => {
      const result = await callApi<BillingBatchPreviewDto>(
        `/api/billing-batches/preview?companyId=${encodeURIComponent(companyId)}&cutoffDate=${encodeURIComponent(cutoffDate)}`,
      )
      if (cancelled) return
      setPreview({ key, data: result.data ?? null, error: result.error?.message ?? null })
    })()
    return () => {
      cancelled = true
    }
  }, [valid, companyId, cutoffDate, key])

  if (!valid) return null
  const current = preview?.key === key ? preview : null
  const data = current?.data ?? null

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      {current === null ? (
        <p className="text-slate-400">กำลังสรุปรายได้ที่จะดึงเข้ารอบ…</p>
      ) : current.error !== null ? (
        <p className="text-red-600">สรุปรายได้ไม่สำเร็จ — {current.error}</p>
      ) : data !== null && data.revenueCount > 0 ? (
        <p>
          จะดึงรายได้ถึง <b>{fmtDate(`${cutoffDate}T00:00:00Z`)}</b> — {fmtCount(data.revenueCount)} รายการ · ยอดเรียกเก็บ{' '}
          <b className="text-emerald-700">{fmtSatangSymbol(data.totalSatang)}</b>
        </p>
      ) : (
        <p className="text-amber-700">ไม่มีรายได้ที่รอวางบิลถึงวันตัดรอบนี้ — สร้างรอบไม่ได้</p>
      )}
      {data !== null && data.laterRevenueCount > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-500">
          <span>
            มีรายได้หลังวันตัดรอบอีก {fmtCount(data.laterRevenueCount)} รายการ ({fmtSatangSymbol(data.laterTotalSatang)})
            {data.laterLatestRevenueDate !== null && ` · ล่าสุด ${fmtDate(`${data.laterLatestRevenueDate}T00:00:00Z`)}`}
            {' '}— ยังไม่ถูกดึงเข้ารอบนี้
          </span>
          {cutoffDate < today && (
            <Button size="sm" variant="secondary" onClick={() => onUseToday(today)}>
              ใช้วันนี้เป็นวันตัดรอบ
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
