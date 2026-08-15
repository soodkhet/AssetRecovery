'use client'

import { Button, Field, Input, InlineAlert } from '@/components/ui'
import { cn } from '@/components/ui/cn'
import {
  REPORT_RANGE_PRESETS,
  REPORT_RANGE_PRESET_LABEL,
  type ReportRangePreset,
} from '@/lib/reports/range'

/**
 * ตัวเลือกช่วงวันที่ของทุกรายงาน (`96` §11) — preset 4 ตัว + กำหนดเอง
 *
 * - `<input type="date">` เป็น **ข้อยกเว้นเดียว** ที่ใช้ ค.ศ. (Rule 01) — ป้ายช่วงที่แสดงผลลัพธ์
 *   ยังเป็น พ.ศ. เสมอ (มาจาก backend ผ่าน `payload.range.label`)
 * - ตรวจเบื้องต้นฝั่งจอเพื่อบอกผู้ใช้ทันที (inline error ตาม `96` §12) — **ยามจริงอยู่ที่ backend**
 *   (`REPORT_DATE_INVALID` ใน `resolveReportRange()`) ฝั่งจอเป็นแค่ UX
 */

export interface ReportRangeValue {
  preset: ReportRangePreset
  from: string
  to: string
}

export function reportRangeQuery(value: ReportRangeValue): URLSearchParams {
  const query = new URLSearchParams({ preset: value.preset })
  if (value.preset === 'custom') {
    if (value.from !== '') query.set('from', value.from)
    if (value.to !== '') query.set('to', value.to)
  }
  return query
}

/** ช่วงที่กรอกครบและไม่กลับหัว — ใช้ปิดปุ่มระหว่างที่ผู้ใช้ยังกรอกไม่เสร็จ */
export function isReportRangeReady(value: ReportRangeValue): boolean {
  if (value.preset !== 'custom') return true
  return value.from !== '' && value.to !== '' && value.from <= value.to
}

export function DateRangePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ReportRangeValue
  onChange: (next: ReportRangeValue) => void
  disabled?: boolean
}) {
  const invalidCustom =
    value.preset === 'custom' && value.from !== '' && value.to !== '' && value.from > value.to

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {REPORT_RANGE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, preset })}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50',
              value.preset === preset
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
            )}
          >
            {REPORT_RANGE_PRESET_LABEL[preset]}
          </button>
        ))}
      </div>

      {value.preset === 'custom' && (
        <div className="flex flex-wrap items-end gap-3">
          <Field id="report-range-from" label="วันเริ่มต้น">
            <Input
              id="report-range-from"
              type="date"
              value={value.from}
              invalid={invalidCustom}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, from: event.target.value })}
            />
          </Field>
          <Field id="report-range-to" label="วันสิ้นสุด">
            <Input
              id="report-range-to"
              type="date"
              value={value.to}
              invalid={invalidCustom}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, to: event.target.value })}
            />
          </Field>
          {value.from === '' || value.to === '' ? (
            <p className="pb-2 text-xs text-slate-500">เลือกทั้งวันเริ่มต้นและวันสิ้นสุดเพื่อดูรายงาน</p>
          ) : null}
        </div>
      )}

      {invalidCustom && (
        <InlineAlert tone="error" title="ช่วงวันที่ไม่ถูกต้อง">
          วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด
        </InlineAlert>
      )}
    </div>
  )
}

/** ปุ่มลัด "เดือนนี้" สำหรับรีเซ็ตกลับค่าเริ่มต้น */
export function ResetRangeButton({ onReset, disabled }: { onReset: () => void; disabled?: boolean }) {
  return (
    <Button variant="ghost" size="sm" onClick={onReset} disabled={disabled}>
      ล้างตัวกรอง
    </Button>
  )
}
