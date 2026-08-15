'use client'

import { useMemo, useState } from 'react'
import { FilterGroup } from '@/components/ui'
import { ReportBarChart } from '@/components/reports/report-bar-chart'
import { ReportView } from '@/components/reports/report-view'
import {
  TAX_INVOICE_DIMENSIONS,
  TAX_INVOICE_DIMENSION_LABEL,
  type TaxInvoiceDimension,
} from '@/lib/reports/accounting/tax-invoice-report'
import type { ReportDefinition } from '@/lib/reports/catalog'

/**
 * หน้าจอของรายงานหมวด A (`96` §6-A) — **ทุกตัวห่อ `<ReportView>`**
 * (ตาราง / ปุ่มส่งออก / ตัวโหลดข้อมูล / แคช เป็นของโครงกลาง 6.1 ห้ามทำใหม่)
 *
 * สิ่งที่แต่ละหน้าทำเองมีแค่ **ตัวกรองเฉพาะรายงาน** และกราฟ:
 * - A1 กราฟแท่งซ้อน ภ.ง.ด.3 / ภ.ง.ด.53 รายรอบนำส่ง
 * - A2 `?dimension=month|company` + กราฟยอดก่อน VAT
 * - A4 กราฟแท่งซ้อน "ยังเปิดอยู่ / ผ่านแบบมีข้อยกเว้น" รายงวด (สองสถานะนี้ห้ามรวมกัน — `34` §6.3)
 * - A3 เป็นตารางประวัติล้วน ⇒ ใช้ `<ReportView>` ตรง ๆ (ลงทะเบียนที่ `<ReportScreen>`)
 */

type ScreenProps = { report: Pick<ReportDefinition, 'id' | 'code' | 'title'> }

const TAX_INVOICE_OPTIONS = TAX_INVOICE_DIMENSIONS.map((value) => ({
  value,
  label: TAX_INVOICE_DIMENSION_LABEL[value],
}))

// ── A1 — สรุป WHT รายเดือน ──────────────────────────────────────────────────

export function WhtSummaryScreen({ report }: ScreenProps) {
  return (
    <ReportView
      report={report}
      chart={({ payload }) =>
        payload === null || payload.rows.length === 0 ? null : (
          <ReportBarChart
            title="ภาษีหัก ณ ที่จ่ายที่ต้องนำส่งรายรอบ"
            rows={payload.rows}
            labelKey="period"
            valueKey="pnd3Satang"
            valueType="money"
            stack={{ valueKey: 'pnd53Satang', baseLabel: 'ภ.ง.ด.3', valueLabel: 'ภ.ง.ด.53' }}
          />
        )
      }
    />
  )
}

// ── A2 — สรุปใบกำกับภาษี ────────────────────────────────────────────────────

export function TaxInvoiceScreen({ report }: ScreenProps) {
  const [dimension, setDimension] = useState<TaxInvoiceDimension>('month')
  const params = useMemo(() => ({ dimension }), [dimension])

  return (
    <ReportView
      report={report}
      params={params}
      filters={<FilterGroup options={TAX_INVOICE_OPTIONS} value={dimension} onChange={setDimension} />}
      chart={({ payload }) =>
        payload === null || payload.rows.length === 0 ? null : (
          <ReportBarChart
            title={`ยอดก่อน VAT ${TAX_INVOICE_DIMENSION_LABEL[dimension]}`}
            rows={payload.rows}
            labelKey="group"
            valueKey="beforeVatSatang"
            valueType="money"
          />
        )
      }
    />
  )
}

// ── A4 — สรุปข้อยกเว้นรายงวด ────────────────────────────────────────────────

export function ExceptionSummaryScreen({ report }: ScreenProps) {
  return (
    <ReportView
      report={report}
      chart={({ payload }) =>
        payload === null || payload.rows.length === 0 ? null : (
          <ReportBarChart
            title="ข้อยกเว้นที่ยังไม่ถูกแก้ต้นเหตุ รายรอบบัญชี"
            rows={payload.rows}
            labelKey="period"
            valueKey="open"
            valueType="number"
            stack={{ valueKey: 'authorized', baseLabel: 'ยังเปิดอยู่', valueLabel: 'ผ่านแบบมีข้อยกเว้น' }}
          />
        )
      }
    />
  )
}
