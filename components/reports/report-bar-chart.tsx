'use client'

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, EmptyState } from '@/components/ui'
import { fmtSatang } from '@/lib/format/money'
import { formatCellText, type ReportColumnType, type ReportRow } from '@/lib/reports/payload'

/**
 * กราฟแท่งของเมนูรายงาน (`96` §6 — F2 "Bar chart เปรียบเทียบรายเดือน" · O1 "Stacked bar chart —
 * success vs fail" · mockup `reports.html` `barChart()`) — **อ่านจาก `rows` ของ payload ชุดเดียวกับ
 * ตาราง** ⇒ กราฟกับตารางขัดกันไม่ได้
 *
 * - Recharts ตาม tech stack ที่ตัดสินใจไว้ (`96` §15) — ห้ามเขียน SVG เองซ้ำ
 * - เงินในแถวเป็น **satang** ⇒ แกน/ทูลทิปหารร้อยผ่าน `fmtSatang()` ที่เดียว (Rule 01)
 * - ค่าติดลบ (กำไรขั้นต้นขาดทุน) ต้องเห็นเป็นสีแดง ไม่ใช่หายไปจากกราฟ
 * - **โหมดซ้อนแท่ง** (ใส่ `stack`) ใช้เมื่อสองค่าเป็นส่วนย่อยของยอดเดียวกัน เช่น สำเร็จ/ไม่สำเร็จ
 *   ของ O1 — ค่าติดลบไม่มีความหมายในโหมดนี้ จึงใช้สีประจำชุดตายตัวแทนการเปลี่ยนสีตามเครื่องหมาย
 */

const POSITIVE = '#0f766e'
const NEGATIVE = '#dc2626'
/** สีของชุดที่สอง (ค่าที่ "ไม่ดี" เช่น เคสไม่สำเร็จ) — โทนเดียวกับ statusBadge กลุ่ม danger */
const SECONDARY = '#f87171'

export function ReportBarChart({
  title,
  rows,
  labelKey,
  valueKey,
  valueType = 'money',
  emptyDescription = 'ยังไม่มีข้อมูลพอจะวาดกราฟในช่วงเวลานี้',
  stack,
}: {
  title: string
  rows: readonly ReportRow[]
  labelKey: string
  valueKey: string
  valueType?: ReportColumnType
  emptyDescription?: string
  /** ซ้อนแท่งที่สองบนแท่งแรก — ทั้งสองค่าต้องเป็นหน่วยเดียวกันและเป็นส่วนย่อยของยอดรวมเดียวกัน */
  stack?: { valueKey: string; valueLabel: string; baseLabel: string }
}) {
  const data = rows.map((row) => ({
    label: String(row[labelKey] ?? '—'),
    value: typeof row[valueKey] === 'number' ? row[valueKey] : 0,
    stacked: stack === undefined ? 0 : typeof row[stack.valueKey] === 'number' ? row[stack.valueKey] : 0,
  }))

  const nameOf = (key: string): string =>
    stack === undefined ? title : key === 'value' ? stack.baseLabel : stack.valueLabel

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
                formatter={(value, name) => {
                  const amount = typeof value === 'number' ? value : Number(value)
                  return [
                    valueType === 'money' ? `฿ ${fmtSatang(amount)}` : formatCellText(amount, valueType),
                    nameOf(String(name)),
                  ]
                }}
              />
              {stack !== undefined && (
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => nameOf(String(value))}
                />
              )}
              <Bar
                dataKey="value"
                name="value"
                stackId={stack === undefined ? undefined : 'total'}
                radius={stack === undefined ? [3, 3, 0, 0] : undefined}
                maxBarSize={56}
                fill={POSITIVE}
              >
                {stack === undefined &&
                  data.map((entry) => <Cell key={entry.label} fill={entry.value < 0 ? NEGATIVE : POSITIVE} />)}
              </Bar>
              {stack !== undefined && (
                <Bar dataKey="stacked" name="stacked" stackId="total" radius={[3, 3, 0, 0]} maxBarSize={56} fill={SECONDARY} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
