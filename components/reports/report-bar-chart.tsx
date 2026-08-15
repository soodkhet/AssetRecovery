'use client'

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, EmptyState } from '@/components/ui'
import { fmtSatang } from '@/lib/format/money'
import { formatCellText, type ReportColumnType, type ReportRow } from '@/lib/reports/payload'

/**
 * กราฟแท่งของเมนูรายงาน (`96` §6 — F2 "Bar chart เปรียบเทียบรายเดือน" · mockup `reports.html`
 * `barChart()`) — **อ่านจาก `rows` ของ payload ชุดเดียวกับตาราง** ⇒ กราฟกับตารางขัดกันไม่ได้
 *
 * - Recharts ตาม tech stack ที่ตัดสินใจไว้ (`96` §15) — ห้ามเขียน SVG เองซ้ำ
 * - เงินในแถวเป็น **satang** ⇒ แกน/ทูลทิปหารร้อยผ่าน `fmtSatang()` ที่เดียว (Rule 01)
 * - ค่าติดลบ (กำไรขั้นต้นขาดทุน) ต้องเห็นเป็นสีแดง ไม่ใช่หายไปจากกราฟ
 */

const POSITIVE = '#0f766e'
const NEGATIVE = '#dc2626'

export function ReportBarChart({
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
    value: typeof row[valueKey] === 'number' ? row[valueKey] : 0,
  }))

  return (
    <Card>
      <p className="mb-3 text-xs font-bold text-slate-500 uppercase">{title}</p>
      {data.length === 0 ? (
        <EmptyState title="ยังไม่มีข้อมูล" description={emptyDescription} />
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-15} height={48} dy={10} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={80}
                tickFormatter={(value: number) => formatCellText(value, valueType)}
              />
              <Tooltip
                cursor={{ fill: '#f1f5f9' }}
                formatter={(value) => {
                  const amount = typeof value === 'number' ? value : Number(value)
                  return [valueType === 'money' ? `฿ ${fmtSatang(amount)}` : formatCellText(amount, valueType), title]
                }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={56}>
                {data.map((entry) => (
                  <Cell key={entry.label} fill={entry.value < 0 ? NEGATIVE : POSITIVE} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
