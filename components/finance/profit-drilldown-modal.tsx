'use client'

import { useEffect, useState } from 'react'
import { Button, InlineAlert, Modal, TBody, THead, Table, TableState, Td, Th, Tr } from '@/components/ui'
import { callApi } from '@/lib/api/types'
import { fmtCount, fmtRatioPct, fmtSatangSymbol } from '@/lib/format/money'
import type { ReportPeriodType } from '@/lib/reports/period'
import type { ProfitDimension } from '@/lib/reports/profitability'
import { grossProfitToneClass, marginToneClass } from '@/lib/reports/profit-ui'
import type { ProfitabilityDrilldownDto } from '@/lib/reports/types'

/**
 * ปุ่ม "เจาะลึก" ของ `21` §8 — รายละเอียดต้นทุนของมิติเดียว (read-only ล้วน `21` §10)
 *
 * ⚠️ ผู้เรียกต้องใส่ `key={target.key}` เพื่อให้โหลดใหม่ทุกครั้งที่เปลี่ยนมิติ
 * ⚠️ ยอดทั้งหมดมาจาก API ชุดเดียวกับตารางสรุป (`21` §15) — หน้าจอแค่ format (Rule 01)
 */
export function ProfitDrilldownModal({
  target,
  dimension,
  period,
  onClose,
}: {
  target: { key: string; label: string } | null
  dimension: ProfitDimension
  period: ReportPeriodType
  onClose: () => void
}) {
  const [detail, setDetail] = useState<ProfitabilityDrilldownDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const targetKey = target?.key ?? null

  useEffect(() => {
    if (targetKey === null) return
    let cancelled = false
    void (async () => {
      const query = new URLSearchParams({ dimension, period })
      const result = await callApi<ProfitabilityDrilldownDto>(
        `/api/reports/profitability/${encodeURIComponent(targetKey)}/drilldown?${query.toString()}`,
      )
      if (cancelled) return
      if (result.error !== undefined) {
        setError({ title: result.error.title, message: result.error.message })
        setLoading(false)
        return
      }
      setDetail(result.data ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [targetKey, dimension, period])

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      size="lg"
      title={`เจาะลึก: ${target?.label ?? ''}`}
      description={detail === null ? undefined : `${detail.periodLabel} · ผลจริงที่เกิดขึ้นแล้ว (actual)`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          ปิดหน้าต่าง
        </Button>
      }
    >
      {loading && <p className="text-sm text-slate-500">กำลังโหลดรายละเอียด…</p>}
      {error !== null && (
        <InlineAlert tone="error" title={error.title}>
          {error.message}
        </InlineAlert>
      )}

      {!loading && error === null && detail !== null && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-xs font-bold text-emerald-600">รายได้ (Revenue)</div>
              <div className="mt-1 font-mono text-xl font-extrabold text-emerald-700">
                {fmtSatangSymbol(detail.revenueSatang)}
              </div>
              <div className="mt-1 text-xs text-emerald-600">
                จาก {fmtCount(detail.revenueCaseCount)} เคส (ก่อน VAT)
              </div>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
              <div className="text-xs font-bold text-amber-600">ต้นทุนตรง (Direct Cost)</div>
              <div className="mt-1 font-mono text-xl font-extrabold text-amber-700">
                {fmtSatangSymbol(detail.directCostSatang)}
              </div>
              <div className="mt-1 text-xs text-amber-600">
                ค่าตอบแทนจาก {fmtCount(detail.costCaseCount)} เคส (ไฟล์ 11/16)
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-600">กำไรขั้นต้น / Margin</div>
              <div className={`mt-1 font-mono text-xl font-extrabold ${grossProfitToneClass(detail.grossProfitSatang)}`}>
                {fmtSatangSymbol(detail.grossProfitSatang)}
              </div>
              <div className={`mt-1 text-xs font-semibold ${marginToneClass(detail.marginPct)}`}>
                {fmtRatioPct(detail.marginPct)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <Table>
              <THead>
                <Tr>
                  <Th>ประเภทต้นทุน</Th>
                  <Th numeric>จำนวนรายการ</Th>
                  <Th numeric>ยอด</Th>
                </Tr>
              </THead>
              <TableState
                loading={false}
                error={null}
                isEmpty={detail.costBreakdown.length === 0}
                emptyTitle="ไม่มีต้นทุนตรงในช่วงเวลานี้"
                emptyDescription="ยังไม่มีค่าตอบแทนที่อนุมัติแล้วผูกกับมิตินี้"
                colSpan={3}
              />
              <TBody>
                {detail.costBreakdown.map((row) => (
                  <Tr key={row.expenseType}>
                    <Td>{row.label}</Td>
                    <Td numeric>{fmtCount(row.count)}</Td>
                    <Td numeric className="font-semibold">
                      {fmtSatangSymbol(row.amountSatang)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          {detail.lossMaking.caseCount > 0 && (
            <InlineAlert
              tone="warning"
              title={`เคสที่มีต้นทุนแต่ไม่มีรายได้ ${fmtCount(detail.lossMaking.caseCount)} เคส`}
            >
              รวม {fmtSatangSymbol(detail.lossMaking.costSatang)} — ต้นทุนก้อนนี้ถูกนับในรายงานและกด Margin ลงจริงตามไฟล์
              21 §6.1
            </InlineAlert>
          )}
        </div>
      )}
    </Modal>
  )
}
