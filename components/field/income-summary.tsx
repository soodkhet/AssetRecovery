'use client'

import { useEffect, useState } from 'react'
import { EmptyState, ErrorState, LoadingState, Select, StatusBadge } from '@/components/ui'
import { apiPath } from '@/lib/api/contract'
import { callApi, type ApiCallError } from '@/lib/api/types'
import { fieldStatusBadgeGroup, fieldStatusLabel } from '@/lib/field/field-ui'
import { ALL_MONTHS, monthKeyOfInstant, monthOptions, monthQueryValue } from '@/lib/field/month-filter'
import type { FieldIncomeSummaryDto } from '@/lib/field/types'
import { fmtDateTime } from '@/lib/format/datetime'
import { fmtSatangSymbol } from '@/lib/format/money'

/**
 * หน้า "สรุปรายได้" (`41` §7.10)
 *
 * - Default = **สะสมตลอด** (ไม่ส่ง `month`) · เลือกเดือนแล้วยิงใหม่ให้ BE กรองให้ (ยอดต้องตรงกับที่ BE คิด)
 * - ยอดคอมมิชชั่น/เบี้ยเสี่ยงมาจากแผนที่ **snapshot ไว้กับเคสนั้น** (`41` §6.8) — หน้าจอห้ามคำนวณเอง
 * - เดือนที่เลือกได้มาจากเคสที่ปิดจริงในชุดสะสม (โหลดครั้งแรกครั้งเดียว)
 */
export function IncomeSummary() {
  const [month, setMonth] = useState<string>(ALL_MONTHS)
  const [data, setData] = useState<FieldIncomeSummaryDto | null>(null)
  const [allTimeItems, setAllTimeItems] = useState<FieldIncomeSummaryDto['items']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiCallError | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const value = monthQueryValue(month)
      const response = await callApi<FieldIncomeSummaryDto>(
        apiPath('field.incomeSummary', undefined, value === undefined ? {} : { month: value }),
      )
      if (cancelled) return
      setData(response.data ?? null)
      setError(response.error ?? null)
      // ชุดสะสม = แหล่งของตัวเลือกเดือน (เคสที่ปิดจริงเท่านั้น)
      if (value === undefined && response.data !== undefined) setAllTimeItems(response.data.items)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [month])

  const months = monthOptions(
    // `closedAt` เป็น instant UTC — ต้องแปลงเป็นเดือนตามเวลาไทยก่อน ไม่งั้นเคสที่ปิดช่วง 00:00–07:00 น.
    // ของวันที่ 1 จะตกไปอยู่เดือนก่อนหน้า (Rule 01 · เหตุผลเดียวกับ `closedMonthKeys()` ของแท็บจบงาน)
    allTimeItems.map((item) => monthKeyOfInstant(item.closedAt)),
    'สะสมตลอด (ทุกเดือน)',
  )

  return (
    <>
      <div className="mb-4 lg:max-w-[280px]">
        <Select
          aria-label="เลือกเดือน"
          value={month}
          onChange={(event) => {
            setLoading(true)
            setMonth(event.target.value)
          }}
        >
          {months.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <LoadingState message="กำลังโหลดสรุปรายได้..." />
      ) : error !== null ? (
        <ErrorState title={error.title} message={error.message} code={error.code} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-slate-900 p-5 text-center">
              <div className="text-xs font-bold text-slate-300">รายได้รวม (คอมมิชชั่น)</div>
              <div className="mt-1 text-[32px] font-extrabold text-white">
                {fmtSatangSymbol(data?.commissionSatang ?? 0)}
              </div>
              <div className="mt-1 text-xs text-slate-400">จากเคสสำเร็จ {data?.successCount ?? 0} เคส</div>
            </div>

            <div className="rounded-xl bg-emerald-50 p-3.5 text-center">
              <div className="text-xl font-extrabold text-emerald-700">{data?.successCount ?? 0}</div>
              <div className="text-[11px] font-bold text-emerald-600">เคสสำเร็จ</div>
              <div className="mt-1 text-xs font-bold text-emerald-700">
                {fmtSatangSymbol(data?.commissionSatang ?? 0)}
              </div>
            </div>

            <div className="rounded-xl bg-slate-100 p-3.5 text-center">
              <div className="text-xl font-extrabold text-slate-600">{data?.failCount ?? 0}</div>
              <div className="text-[11px] font-bold text-slate-500">เคสไม่สำเร็จ</div>
              <div className="mt-1 text-xs font-bold text-slate-600">
                {fmtSatangSymbol(data?.noSuccessFeeSatang ?? 0)} (เบี้ยเสี่ยง)
              </div>
            </div>
          </div>

          <h2 className="mb-2 text-[13px] font-extrabold text-slate-600">รายการเคสที่ปิดแล้ว</h2>
          {(data?.items.length ?? 0) === 0 ? (
            <EmptyState title="ไม่มีเคสในช่วงที่เลือก" />
          ) : (
            <div className="space-y-1.5 lg:space-y-3">
              {data?.items.map((item) => (
                <div
                  key={item.caseId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-700">{item.debtorName ?? '—'}</div>
                    <div className="truncate text-[11px] text-slate-400">
                      {item.caseRef} · {fmtDateTime(item.closedAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge
                      status={fieldStatusLabel(item.outcome)}
                      group={fieldStatusBadgeGroup(item.outcome)}
                    />
                    <div className="mt-0.5 text-[13px] font-extrabold text-slate-700">
                      {fmtSatangSymbol(item.amountSatang)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
