'use client'

import { Button, Input } from '@/components/ui'
import { fmtSatangSymbol } from '@/lib/format/money'
import { emptySubstituteLine, substituteDraftTotalSatang, type SubstituteLineDraft } from '@/lib/substitute-receipts/form'
import { SUBSTITUTE_RECEIPT_MAX_LINES } from '@/lib/substitute-receipts/substitute-receipt'

/**
 * ช่องติ๊ก **"ไม่มีใบเสร็จ"** + ตารางรายการรายจ่าย (มติ PO U103) — ใช้ร่วมฟอร์มเบิกค่าที่พัก (Field Tracker:
 * Mobile/Desktop component เดียว) และฟอร์มเคลียร์เงินทดรอง · บันทึกแล้วระบบออก "ใบรับรองแทนใบเสร็จรับเงิน"
 * ให้ดาวน์โหลดไปเซ็น แล้วอัปโหลดฉบับเซ็นแทนใบเสร็จ
 * ⚠️ ยอดรวมที่แสดงเป็นตัวช่วยกรอกเท่านั้น — server คำนวณ/ตรวจเพดานใหม่เสมอ
 */
export function NoReceiptToggle({
  checked,
  onChange,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  hint: string
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
      <input
        type="checkbox"
        className="focus-ring mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="font-semibold">ไม่มีใบเสร็จ</span>
        <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  )
}

export function NoReceiptLinesEditor({
  lines,
  onChange,
  defaultDate,
}: {
  lines: readonly SubstituteLineDraft[]
  onChange: (lines: SubstituteLineDraft[]) => void
  /** วันที่ตั้งต้นของบรรทัดใหม่ (`YYYY-MM-DD`) */
  defaultDate: string
}) {
  const total = substituteDraftTotalSatang(lines)

  function update(key: string, patch: Partial<SubstituteLineDraft>): void {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function add(): void {
    if (lines.length >= SUBSTITUTE_RECEIPT_MAX_LINES) return
    onChange([...lines, emptySubstituteLine(`line-${Date.now()}-${lines.length}`, defaultDate)])
  }

  function remove(key: string): void {
    onChange(lines.filter((line) => line.key !== key))
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <p className="text-xs text-slate-600">
        กรอกรายจ่ายที่เรียกใบเสร็จไม่ได้ (เช่น ค่าทางด่วน ค่ารถรับจ้าง ค่าที่จอดรถ) — ระบบจะออกใบรับรองแทนใบเสร็จรับเงินให้ดาวน์โหลดไปเซ็น
        แล้วอัปโหลดฉบับเซ็นกลับเข้าระบบ · ยอดรวมต้องไม่เกินเพดานที่บริษัทกำหนด
      </p>
      {lines.map((line, index) => (
        <div key={line.key} className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">รายการที่ {index + 1}</span>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => remove(line.key)}
                aria-label={`ลบรายการที่ ${index + 1}`}
                className="focus-ring rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:text-red-600"
              >
                ลบ
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[150px_1fr_130px]">
            <Input
              type="date"
              aria-label={`วันที่จ่าย รายการที่ ${index + 1}`}
              value={line.lineDate}
              onChange={(event) => update(line.key, { lineDate: event.target.value })}
            />
            <Input
              aria-label={`รายละเอียดรายจ่าย รายการที่ ${index + 1}`}
              placeholder="รายละเอียด เช่น ค่าผ่านทางพิเศษ ด่านบางนา"
              value={line.description}
              onChange={(event) => update(line.key, { description: event.target.value })}
            />
            <Input
              numeric
              inputMode="decimal"
              aria-label={`จำนวนเงิน (บาท) รายการที่ ${index + 1}`}
              placeholder="0.00"
              value={line.amountBaht}
              onChange={(event) => update(line.key, { amountBaht: event.target.value })}
            />
          </div>
          <Input
            aria-label={`หมายเหตุ รายการที่ ${index + 1}`}
            placeholder="หมายเหตุ / ผู้รับเงิน / สถานที่ (ถ้ามี)"
            value={line.note}
            onChange={(event) => update(line.key, { note: event.target.value })}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {lines.length < SUBSTITUTE_RECEIPT_MAX_LINES ? (
          <Button size="sm" variant="secondary" onClick={add}>
            + เพิ่มรายการ
          </Button>
        ) : (
          <span className="text-xs text-slate-500">ครบ {SUBSTITUTE_RECEIPT_MAX_LINES} รายการต่อใบแล้ว</span>
        )}
        <span className="text-sm font-semibold text-slate-800">รวม {fmtSatangSymbol(total)}</span>
      </div>
    </div>
  )
}
