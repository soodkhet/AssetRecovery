'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, EmptyState } from '@/components/ui'
import { fmtSatang } from '@/lib/format/money'
import { formatCellText, type ReportColumnType, type ReportRow } from '@/lib/reports/payload'

/**
 * กราฟเส้นของเมนูรายงาน (`96` §6-E1 — "Revenue trend รายเดือน (12 เดือนย้อนหลัง) — Line chart" ·
 * "Success rate trend รายเดือน — Line chart" · mockup `reports.html` `lineChart()`)
 *
 * คู่แฝดของ `<ReportBarChart>` (6.2) และกติกาเดียวกันทุกข้อ:
 * - **อ่านจาก `rows` ของ payload ชุดเดียวกับตาราง** ⇒ กราฟกับตารางขัดกันไม่ได้
 * - Recharts ตาม tech stack ที่ตัดสินใจไว้ (`96` §15) — ห้ามเขียน SVG เอง
 * - เงินในแถวเป็น **satang** ⇒ แกน/ทูลทิปหารร้อยผ่าน `fmtSatang()` ที่เดียว (Rule 01)
 * - ค่า `null` = ไม่มีข้อมูล (เช่น % สำเร็จของเดือนที่ยังไม่มีเคสปิด) ⇒ **เว้นช่องว่างในเส้น**
 *   ห้ามแทนด้วย 0 เพราะ 0% กับ "ยังไม่มีข้อมูล" คนละความหมาย
 */

const LINE_COLOR = '#0f766e'

export function ReportLineChart({
  title,
  rows,
  labelKey,
  valueKey,
  valueType = 'money',
  emptyDescription = 'ยังไม่มีข้อมูลพอจะวาดกราฟในช่วงเวลานี้',
}: {
  title: string
  rows: readonly ReportRow[]
  labelKey: string
  valueKey: string
  valueType?: ReportColumnType
  emptyDescription?: string
}) {
  const data = rows.map((row) => ({
    label: String(row[labelKey] ?? '—'),
    value: typeof row[valueKey] === 'number' ? row[valueKey] : null,
  }))

  return (
    <Card>
      <p className="mb-3 text-xs font-bold text-slate-500 uppercase">{title}</p>
      {data.length === 0 ? (
        <EmptyState title="ยังไม่มีข้อมูล" description={emptyDescription} />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-15} height={48} dy={10} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={80}
                tickFormatter={(value: number) => formatCellText(value, valueType)}
              />
              <Tooltip
                cursor={{ stroke: '#cbd5e1' }}
                formatter={(value) => {
                  const amount = typeof value === 'number' ? value : Number(value)
                  return [valueType === 'money' ? `฿ ${fmtSatang(amount)}` : formatCellText(amount, valueType), title]
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={title}
                stroke={LINE_COLOR}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
