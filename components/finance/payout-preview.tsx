'use client'

import { useEffect, useState } from 'react'
import { callApi } from '@/lib/api/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import type { PayoutBatchPreviewDto } from '@/lib/payout/queries'
import { resolveDueDate } from '@/lib/settings/cycles'
import type { CycleDto } from '@/lib/settings/types'

/**
 * staging E-049 — สรุปก่อนกดสร้างรอบจ่าย: วันตัดรอบนี้ดึงรายการกี่รายการ/กี่คน/ยอดเท่าไร + กำหนดจ่ายตามรอบ AP
 * (ตัวคัดรายการเดียวกับตอนสร้างจริง — `GET /api/payout-batches/preview`)
 */
export function PayoutPreview({
  side,
  cutoffDate,
  cycle,
}: {
  side: 'inhouse' | 'outsource'
  cutoffDate: string
  cycle: CycleDto | null
}) {
  const [preview, setPreview] = useState<{ key: string; data: PayoutBatchPreviewDto | null; error: string | null } | null>(
    null,
  )
  const key = `${side}|${cutoffDate}`

  useEffect(() => {
    if (cutoffDate === '') return
    let cancelled = false
    void (async () => {
      const result = await callApi<PayoutBatchPreviewDto>(
        `/api/payout-batches/preview?side=${side}&cutoffDate=${encodeURIComponent(cutoffDate)}`,
      )
      if (cancelled) return
      setPreview({ key, data: result.data ?? null, error: result.error?.message ?? null })
    })()
    return () => {
      cancelled = true
    }
  }, [side, cutoffDate, key])

  if (cutoffDate === '') return null
  const dueDate = cycle === null ? null : resolveDueDate(new Date(`${cutoffDate}T00:00:00Z`), cycle)
  const current = preview?.key === key ? preview : null

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <p>
        ตัดรอบ <b>{fmtDate(`${cutoffDate}T00:00:00Z`)}</b>
        {dueDate !== null && (
          <>
            {' '}· กำหนดจ่าย <b>{fmtDate(dueDate)}</b>
          </>
        )}
      </p>
      {current === null ? (
        <p className="text-slate-400">กำลังสรุปรายการที่จะดึงเข้ารอบ…</p>
      ) : current.error !== null ? (
        <p className="text-red-600">สรุปรายการไม่สำเร็จ — {current.error}</p>
      ) : current.data !== null && current.data.itemCount > 0 ? (
        <p>
          จะดึง {fmtCount(current.data.itemCount)} รายการ ({fmtCount(current.data.payeeCount)} คน) · สุทธิ{' '}
          <b className="text-emerald-700">{fmtSatangSymbol(current.data.netSatang)}</b>
        </p>
      ) : (
        <p className="text-amber-700">ไม่มีรายการที่อนุมัติแล้วถึงวันตัดรอบนี้</p>
      )}
      {current?.data?.blocked != null && current.data.itemCount > 0 && (
        <p className="mt-1 text-red-600">สร้างรอบนี้ยังไม่ได้: {current.data.blocked}</p>
      )}
    </div>
  )
}
