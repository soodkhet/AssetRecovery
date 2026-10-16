'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Button, InlineAlert, LoadingState, Modal } from '@/components/ui'
import {
  READINESS_CHECK_LINK,
  readinessDescription,
  readinessVerdict,
  type ReadinessLink,
  type ReadinessWarningItem,
} from '@/lib/accounting/period'
import type { AccountingPeriodDto, PeriodReadinessDto } from '@/lib/accounting/types'
import { callApi } from '@/lib/api/types'
import { fmtDate } from '@/lib/format/datetime'
import { fmtCount, fmtSatangSymbol } from '@/lib/format/money'
import { PAYOUT_STATUS_LABEL_SHORT } from '@/lib/payout/payout-ui'
import { exceptionModuleLabel } from '@/lib/reports/dashboard'

/**
 * Modal "ตรวจความพร้อม" (`30` §8 · mockup `accounting.html` `accounting-checklist`)
 *
 * ⚠️ ผลตรวจ**อ่านสดจาก API ทุกครั้งที่เปิด** (`POST /api/accounting/periods/:id/readiness` — ตรวจสด + บันทึกผล · staging E-069) —
 *    ห้ามใช้ `exportReady` ที่ค้างอยู่ในแถวมาแสดงแทน เพราะเป็นผลของการตรวจครั้งก่อน
 * ⚠️ **ไม่มีปุ่ม force ข้าม** โดยเจตนา (`30` §10) — ไม่ผ่านต้องกลับไปแก้ที่โมดูลต้นทาง
 */
export function ReadinessModal({
  period,
  onClose,
  onChecked,
}: {
  period: AccountingPeriodDto | null
  onClose: () => void
  /** staging E-069 — บันทึกผลตรวจแล้ว ⇒ ให้หน้ารายการโหลดแถวใหม่ ("ตรวจล่าสุด … · ผ่าน N/M") */
  onChecked?: () => void
}) {
  const [data, setData] = useState<PeriodReadinessDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const periodId = period?.id ?? ''
  const onCheckedRef = useRef(onChecked)
  useEffect(() => {
    onCheckedRef.current = onChecked
  }, [onChecked])

  useEffect(() => {
    if (periodId === '') return
    let cancelled = false
    void (async () => {
      // staging E-069 — POST = ตรวจสด + บันทึกเวลา/ผลลงรอบบัญชี
      const result = await callApi<PeriodReadinessDto>(`/api/accounting/periods/${periodId}/readiness`, {
        method: 'POST',
      })
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setData(result.data ?? null)
      setError(null)
      setLoading(false)
      onCheckedRef.current?.()
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
      description={readinessDescription(data === null ? null : data.checks.length)}
      footer={
        <Button variant="secondary" onClick={onClose}>
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
                  {/* mytester H-05 — เงื่อนไขที่ไม่ผ่านพาไปหน้าที่ต้องแก้ได้ทันที */}
                  {!check.passed && READINESS_CHECK_LINK[check.key] !== null && (
                    <Link
                      href={READINESS_CHECK_LINK[check.key]?.href ?? '#'}
                      className="mt-1 inline-block text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
                    >
                      {READINESS_CHECK_LINK[check.key]?.label} →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <ReadinessWarnings items={data.warningItems} />

          {data.criticalOpen.length > 0 && (
            <div className="rounded-lg border border-red-200">
              <div className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                ข้อยกเว้นระดับวิกฤตที่ยังเปิดอยู่ {fmtCount(data.criticalOpen.length)} รายการ — แก้ที่ต้นทาง
                หรือให้ผู้บริหารอนุมัติยกเว้นในแท็บ “เอกสารไม่ครบ”
              </div>
              {data.criticalOpen.map((item) => (
                <div key={item.id} className="border-t border-red-100 px-3 py-2 text-xs text-slate-700">
                  <span className="font-semibold">{exceptionModuleLabel(item.sourceModule)}</span> · {item.title}
                </div>
              ))}
            </div>
          )}

          {data.billingMismatches.length > 0 && (
            <div className="rounded-lg border border-red-200">
              <div className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                ยอดรอบวางบิลยังไม่ตรงกับรายได้ในรอบ {fmtCount(data.billingMismatches.length)} รอบ
              </div>
              {data.billingMismatches.map((item) => (
                <div key={item.billingBatchId} className="border-t border-red-100 px-3 py-2 text-xs text-slate-700">
                  <span className="font-mono">{item.batchNumber}</span> · {item.companyName} · รอบบิล{' '}
                  {fmtSatangSymbol(item.batchTotalSatang)} ≠ รายได้ {fmtSatangSymbol(item.revenueTotalSatang)}
                </div>
              ))}
            </div>
          )}

          {/* มติ PO U112 — รอบจ่ายของงวดที่ยังไม่จ่ายสำเร็จ/ยกเลิก: บล็อกการส่ง/ล็อกงวด */}
          {data.openPayoutBatches.length > 0 && (
            <div className="rounded-lg border border-red-200">
              <div className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                รอบจ่ายของงวดนี้ที่ต้องยืนยันจ่ายสำเร็จหรือยกเลิกก่อน {fmtCount(data.openPayoutBatches.length)} รอบ
              </div>
              {data.openPayoutBatches.map((item) => (
                <div key={item.id} className="border-t border-red-100 px-3 py-2 text-xs text-slate-700">
                  <span className="font-semibold">{item.name}</span> · {PAYOUT_STATUS_LABEL_SHORT[item.status]} · สร้างเมื่อ{' '}
                  {fmtDate(item.createdAt)} · โอนสุทธิ {fmtSatangSymbol(item.transferSatang)}
                </div>
              ))}
            </div>
          )}

          {/* มติ PO U87 — รายได้ค้างรับ: เตือน ไม่บล็อก (แยกจากยอดไม่ตรงจริงด้านบน) */}
          {data.unbilledRevenue.byCompany.length > 0 && (
            <div className="rounded-lg border border-amber-200">
              <div className="bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                รายได้ค้างรับยังไม่วางบิล แยกตามบริษัท
              </div>
              {data.unbilledRevenue.byCompany.map((item) => (
                <div key={item.companyName} className="border-t border-amber-100 px-3 py-2 text-xs text-slate-700">
                  {item.companyName} · {fmtCount(item.count)} รายการ · {fmtSatangSymbol(item.totalSatang)}
                </div>
              ))}
            </div>
          )}

          <p className="text-center text-xs font-semibold">
            {readinessVerdict(data) === 'ready' ? (
              <span className="text-emerald-600">พร้อมส่งสำนักงานบัญชีแล้ว</span>
            ) : readinessVerdict(data) === 'waiting_period_end' ? (
              // ตรวจ staging SV5-PC-07 — ติดแค่รอสิ้นเดือน ไม่มีอะไรให้แก้
              <span className="text-amber-600">
                ข้อมูลพร้อมแล้ว — รอสิ้นเดือน ({data.checks.find((check) => check.key === 'period_ended')?.detail})
              </span>
            ) : (
              <span className="text-red-600">ยังไม่พร้อม — แก้รายการที่ติด ✗ ก่อนจึงจะส่งได้</span>
            )}
          </p>
        </div>
      )}
    </Modal>
  )
}

/**
 * mytester3 H3-01 — คำเตือนทุกแหล่ง (ข้อยกเว้นระดับคำเตือน · ศูนย์ต้นทุนว่าง ฯลฯ) อยู่ใต้หัวข้อเดียว
 * (เดิม render กล่องละหัวข้อ ⇒ หัวข้อ "คำเตือน — ผ่านได้แต่ควรตรวจก่อน" ซ้ำเมื่อมีหลายกลุ่ม)
 */
/** known H-05 — คำเตือนแต่ละข้อมีลิงก์ไปหน้าที่ตรวจ/แก้ได้ */
function WarningLink({ link }: { link: ReadinessLink | null }) {
  if (link === null) return null
  return (
    <>
      {' '}
      <Link href={link.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
        {link.label} →
      </Link>
    </>
  )
}

export function ReadinessWarnings({ items }: { items: readonly ReadinessWarningItem[] }) {
  if (items.length === 0) return null
  const [first] = items
  return (
    <InlineAlert tone="warning" title="คำเตือน — ผ่านได้แต่ควรตรวจก่อน">
      {items.length === 1 && first !== undefined ? (
        <>
          {first.text}
          <WarningLink link={first.link} />
        </>
      ) : (
        <ul className="list-disc space-y-1 pl-4">
          {items.map((item) => (
            <li key={item.text}>
              {item.text}
              <WarningLink link={item.link} />
            </li>
          ))}
        </ul>
      )}
    </InlineAlert>
  )
}
