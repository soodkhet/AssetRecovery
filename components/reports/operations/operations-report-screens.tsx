'use client'

import { useMemo, useState } from 'react'
import { FilterGroup } from '@/components/ui'
import { ReportBarChart } from '@/components/reports/report-bar-chart'
import { ReportView } from '@/components/reports/report-view'
import type { ReportDefinition } from '@/lib/reports/catalog'
import {
  SUCCESS_RATE_DIMENSIONS,
  SUCCESS_RATE_DIMENSION_LABEL,
  type SuccessRateDimension,
} from '@/lib/reports/operations/success-rate-report'

/**
 * หน้าจอของรายงานหมวด O (`96` §6-O) — **ทุกตัวห่อ `<ReportView>`**
 * (ตาราง / ปุ่มส่งออก / ตัวโหลดข้อมูล / แคช เป็นของโครงกลาง 6.1 ห้ามทำใหม่)
 *
 * สิ่งที่แต่ละหน้าทำเองมีแค่ **ตัวกรองเฉพาะรายงาน** และกราฟ:
 * - O1 `?dimension=team|company|month` + **กราฟแท่งซ้อน สำเร็จ/ไม่สำเร็จ** (`96` §6-O1)
 * - O2 กราฟแท่ง TAT เฉลี่ยรายทีม (ตัวกรองทีมเป็นสิทธิ์ระดับผู้ใช้ ไม่ใช่ตัวเลือกบนจอ — `96` §10)
 * - O5 กราฟแท่งจำนวนเครื่องในคลังรายบริษัท
 * - O3/O4 ไม่มีพารามิเตอร์/กราฟ ⇒ ใช้ `<ReportView>` ตรง ๆ (ลงทะเบียนที่ `<ReportScreen>`)
 */

type ScreenProps = { report: Pick<ReportDefinition, 'id' | 'code' | 'title'> }

const SUCCESS_RATE_OPTIONS = SUCCESS_RATE_DIMENSIONS.map((value) => ({
  value,
  label: SUCCESS_RATE_DIMENSION_LABEL[value],
}))

// ── O1 — อัตราความสำเร็จ ────────────────────────────────────────────────────

export function SuccessRateScreen({ report }: ScreenProps) {
  const [dimension, setDimension] = useState<SuccessRateDimension>('team')
  const params = useMemo(() => ({ dimension }), [dimension])

  return (
    <ReportView
      report={report}
      params={params}
      filters={<FilterGroup options={SUCCESS_RATE_OPTIONS} value={dimension} onChange={setDimension} />}
      chart={({ payload }) =>
        payload === null || payload.rows.length === 0 ? null : (
          <ReportBarChart
            title={`ผลการติดตาม${SUCCESS_RATE_DIMENSION_LABEL[dimension]} (เคสที่ปิดแล้ว)`}
            rows={payload.rows}
            labelKey="group"
            valueKey="successCount"
            valueType="number"
            stack={{ valueKey: 'failCount', baseLabel: 'สำเร็จ', valueLabel: 'ไม่สำเร็จ' }}
          />
        )
      }
    />
  )
}

// ── O2 — ประสิทธิภาพทีม / SLA ───────────────────────────────────────────────

export function TeamPerformanceScreen({ report }: ScreenProps) {
  return (
    <ReportView
      report={report}
      chart={({ payload }) =>
        payload === null || payload.rows.length === 0 ? null : (
          <ReportBarChart
            title="เวลาเฉลี่ยในการปิดงาน (วัน)"
            rows={payload.rows}
            labelKey="team"
            valueKey="avgTatDays"
            valueType="number"
          />
        )
      }
    />
  )
}

// ── O5 — สรุปคลังสินค้า ─────────────────────────────────────────────────────

export function WarehouseSummaryScreen({ report }: ScreenProps) {
  return (
    <ReportView
      report={report}
      chart={({ payload }) =>
        payload === null || payload.rows.length === 0 ? null : (
          <ReportBarChart
            title="เครื่องที่อยู่ในคลังรายบริษัทไฟแนนซ์"
            rows={payload.rows}
            labelKey="company"
            valueKey="inCustody"
            valueType="number"
            stack={{ valueKey: 'handoverPending', baseLabel: 'ในคลัง', valueLabel: 'รอส่งมอบ' }}
          />
        )
      }
    />
  )
}
