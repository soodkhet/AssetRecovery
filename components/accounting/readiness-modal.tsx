'use client'

import { useEffect, useState } from 'react'
import { Button, InlineAlert, LoadingState, Modal, RefText } from '@/components/ui'
import type { AccountingPeriodDto, PeriodReadinessDto } from '@/lib/accounting/types'
import { callApi } from '@/lib/api/types'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'

/**
 * Modal "ตรวจความพร้อม" (`30` §8 · mockup `accounting.html` `accounting-checklist`)
 *
 * ⚠️ ผลตรวจ**อ่านสดจาก API ทุกครั้งที่เปิด** (`GET /api/accounting/periods/:id/readiness`) —
 *    ห้ามใช้ `exportReady` ที่ค้างอยู่ในแถวมาแสดงแทน เพราะเป็นผลของการตรวจครั้งก่อน
 * ⚠️ **ไม่มีปุ่ม force ข้าม** โดยเจตนา (`30` §10) — ไม่ผ่านต้องกลับไปแก้ที่โมดูลต้นทาง
 */
export function ReadinessModal({
  period,
  onClose,
}: {
  period: AccountingPeriodDto | null
  onClose: () => void
}) {
  const [data, setData] = useState<PeriodReadinessDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const periodId = period?.id ?? ''

  useEffect(() => {
    if (periodId === '') return
    let cancelled = false
    void (async () => {
      const result = await callApi<PeriodReadinessDto>(`/api/accounting/periods/${periodId}/readiness`)
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setData(result.data ?? null)
      setError(null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [periodId])

  if (period === null) return null

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`ตรวจความพร้อมก่อนส่งบัญชี — ${period.periodLabel}`}
      description="เงื่อนไข 3 ข้อตามไฟล์ 30 §6.2 — ตรวจสดทุกครั้งที่เปิดหน้าต่างนี้ ไม่มีทางลัดข้าม"
      footer={
        <Button variant="ghost" onClick={onClose}>
          ปิดหน้าต่าง
        </Button>
      }
    >
      {loading && <LoadingState message="กำลังตรวจความพร้อมของรอบบัญชี..." />}

      {!loading && error !== null && (
        <InlineAlert tone="error" title={error.title}>
          {error.message}
        </InlineAlert>
      )}

      {!loading && error === null && data !== null && (
        <div className="space-y-4">
          <ul className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            {data.checks.map((check) => (
              <li key={check.key} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={
                    check.passed
                      ? 'mt-0.5 text-sm font-bold text-emerald-600'
                      : 'mt-0.5 text-sm font-bold text-red-600'
                  }
                >
                  {check.passed ? '✓' : '✗'}
                </span>
                <div>
                  <div
                    className={
                      check.passed
                        ? 'text-sm font-semibold text-emerald-700'
                        : 'text-sm font-semibold text-red-600'
                    }
                  >
                    {check.label}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          {data.warnings.map((warning) => (
            <InlineAlert key={warning} tone="warning" title="คำเตือน — ผ่านได้แต่ควรตรวจก่อน">
              {warning}
            </InlineAlert>
          ))}

          {data.criticalOpen.length > 0 && (
            <div className="rounded-lg border border-red-200">
              <div className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                ข้อยกเว้นระดับวิกฤตที่ยังเปิดอยู่ {fmtCount(data.criticalOpen.length)} รายการ — แก้ที่ต้นทาง
                หรือให้ผู้บริหารอนุมัติยกเว้นในแท็บ “เอกสารไม่ครบ”
              </div>
              {data.criticalOpen.map((item) => (
                <div key={item.id} className="border-t border-red-100 px-3 py-2 text-xs text-slate-700">
                  <RefText>{item.sourceModule}</RefText> · {item.title}
                </div>
              ))}
            </div>
          )}

          {data.billingMismatches.length > 0 && (
            <div className="rounded-lg border border-red-200">
              <div className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                ยอดวางบิลยังไม่ตรงกับรายได้ {fmtCount(data.billingMismatches.length)} รายการ
              </div>
              {data.billingMismatches.map((item) => (
                <div
                  key={`${item.billingBatchId ?? 'unbilled'}-${item.companyName}`}
                  className="border-t border-red-100 px-3 py-2 text-xs text-slate-700"
                >
                  {item.companyName} ·{' '}
                  {item.reason === 'not_billed'
                    ? `ยังไม่ถูกวางบิล ${fmtSatangSymbol(item.revenueTotalSatang)}`
                    : `รอบบิล ${fmtSatangSymbol(item.batchTotalSatang)} ≠ รายได้ ${fmtSatangSymbol(item.revenueTotalSatang)}`}
                </div>
              ))}
            </div>
          )}

          <p className="text-center text-xs font-semibold">
            {data.ready ? (
              <span className="text-emerald-600">พร้อมส่งสำนักงานบัญชีแล้ว</span>
            ) : (
              <span className="text-red-600">ยังไม่พร้อม — แก้รายการที่ติด ✗ ก่อนจึงจะส่งได้</span>
            )}
          </p>
        </div>
      )}
    </Modal>
  )
}
