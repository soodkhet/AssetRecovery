'use client'

import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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

/**
 * ขีดแกนค่าของกราฟแท่ง — **รวม 0 เสมอ** และเป็นเลขกลม (ขั้น 1/2/5 × 10ⁿ)
 *
 * - แท่งวาดจากเส้นฐาน 0 ถ้าแกนไม่ครอบ 0 (ขาดทุนทุกเคส) แท่งจะไม่ถูกวาดเลย (mytester2 J2-01)
 * - ปล่อยให้ Recharts ใช้ min/max ของข้อมูลเป็นขอบแกน ⇒ ป้ายเป็นเลขไม่กลม (283.32 / −56.17) และไม่มีป้าย 0
 *   ทั้งที่มีแท่งบวกและลบ (mytester2 LR-02) — จึงคำนวณขีดเองแล้วส่ง `ticks` + `domain` ให้แกน
 * - `minStep` = ขั้นเล็กสุดในหน่วยข้อมูล: เงินเป็น satang ⇒ 100 (ขั้นละ 1 บาทขึ้นไป ไม่มีสตางค์บนแกน)
 */
export function valueAxisTicks(values: readonly number[], minStep = 1, targetCount = 5): number[] {
  const finite = values.filter((value) => Number.isFinite(value))
  const lo = Math.min(0, ...finite)
  const hi = Math.max(0, ...finite)
  if (lo === hi) return [0, minStep]
  const raw = (hi - lo) / Math.max(1, targetCount - 1)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / magnitude
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  const step = Math.max(nice * magnitude, minStep)
  const first = Math.floor(lo / step)
  const last = Math.ceil(hi / step)
  const ticks: number[] = []
  // ทำงานเป็นจำนวนเต็มเท่าของขั้นแล้วค่อยคูณ — กันเศษทศนิยมสะสม (0.1 + 0.2)
  for (let i = first; i <= last; i++) ticks.push(Number((i * step).toPrecision(12)) || 0)
  return ticks
}

export function ReportBarChart({
  title,
  rows,
  labelKey,
  valueKey,
  valueType = 'money',
  emptyDescription = 'ยังไม่มีข้อมูลพอจะวาดกราฟในช่วงเวลานี้',
  stack,
  xAxis,
}: {
  title: string
  rows: readonly ReportRow[]
  labelKey: string
  valueKey: string
  valueType?: ReportColumnType
  emptyDescription?: string
  /** ซ้อนแท่งที่สองบนแท่งแรก — ทั้งสองค่าต้องเป็นหน่วยเดียวกันและเป็นส่วนย่อยของยอดรวมเดียวกัน */
  stack?: { valueKey: string; valueLabel: string; baseLabel: string }
  /** ปรับป้ายแกน X (เช่น จอแคบ: เอียงมากขึ้น/แสดงเว้นป้าย) — ไม่ระบุ = ทุกป้าย เอียง −15° */
  xAxis?: { interval?: number; angle?: number; height?: number }
}) {
  const data = rows.map((row) => ({
    label: String(row[labelKey] ?? '—'),
    value: typeof row[valueKey] === 'number' ? row[valueKey] : 0,
    stacked: stack === undefined ? 0 : typeof row[stack.valueKey] === 'number' ? row[stack.valueKey] : 0,
  }))

  // โหมดซ้อนแท่ง ⇒ ยอดสูงสุดคือผลรวมสองชุด ไม่ใช่ค่าชุดเดียว
  const axisTicks = valueAxisTicks(
    data.flatMap((entry) => {
      const base = typeof entry.value === 'number' ? entry.value : 0
      const stacked = typeof entry.stacked === 'number' ? entry.stacked : 0
      return stack === undefined ? [base] : [base, base + stacked]
    }),
    valueType === 'money' ? 100 : 1,
  )

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
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                interval={xAxis?.interval ?? 0}
                angle={xAxis?.angle ?? -15}
                height={xAxis?.height ?? 48}
                dy={10}
                textAnchor={(xAxis?.angle ?? -15) <= -30 ? 'end' : 'middle'}
              />
              <YAxis
                domain={[axisTicks[0] ?? 0, axisTicks[axisTicks.length - 1] ?? 0]}
                ticks={axisTicks}
                interval={0}
                allowDataOverflow
                tick={{ fontSize: 11, fill: '#64748b' }}
                width={80}
                tickFormatter={(value: number) => formatCellText(value, valueType)}
              />
              <ReferenceLine y={0} stroke="#94a3b8" />
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
                  // key ตามลำดับ — ป้ายซ้ำกันได้ (เช่น "—" หลายแถวตอน drill-down) จน React เตือน duplicate key (BUG-136)
                  data.map((entry, index) => (
                    <Cell key={`${index}:${entry.label}`} fill={entry.value < 0 ? NEGATIVE : POSITIVE} />
                  ))}
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
