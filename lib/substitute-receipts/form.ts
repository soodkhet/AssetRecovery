import { parseBahtInput, toBahtInput } from '@/lib/format/money'
import type { SubstituteReceiptLineDto } from '@/lib/substitute-receipts/types'
import { substituteReceiptDraftSchema } from '@/lib/substitute-receipts/schemas'

/**
 * ค่าในฟอร์ม "ไม่มีใบเสร็จ" (มติ PO U103) — **pure** ใช้ร่วมฟอร์มเบิกค่าที่พัก (Field Tracker — Mobile/Desktop
 * component เดียว) และฟอร์มเคลียร์เงินทดรอง · ตรวจด้วย Zod ชุดเดียวกับ BE (`substituteReceiptDraftSchema`)
 * เงินกรอกเป็นบาท → satang ด้วย `parseBahtInput()` (Rule 01 — ห้ามคูณ 100 เอง)
 */

export interface SubstituteLineDraft {
  key: string
  /** `YYYY-MM-DD` จาก `<input type="date">` (ข้อยกเว้นเดียวที่ใช้ ค.ศ. — Rule 01) */
  lineDate: string
  description: string
  amountBaht: string
  note: string
}

export function emptySubstituteLine(key: string, lineDate = ''): SubstituteLineDraft {
  return { key, lineDate, description: '', amountBaht: '', note: '' }
}

/** ยอดรวมของบรรทัดที่กรอกยอดถูกต้องแล้ว — ใช้แสดงผลในฟอร์ม (ค่าจริงฝั่ง server คำนวณใหม่เสมอ) */
export function substituteDraftTotalSatang(drafts: readonly SubstituteLineDraft[]): number {
  return drafts.reduce((sum, draft) => {
    const amount = parseBahtInput(draft.amountBaht)
    return amount === null || Number.isNaN(amount) || amount <= 0 ? sum : sum + amount
  }, 0)
}

export interface SubstituteDraftPayload {
  lines: Array<{ lineDate: string; description: string; amountSatang: number; note: string | null }>
}

/** ฟอร์ม → payload ของ API · ผิดข้อใด = `{ error }` ข้อความแรกที่ผู้ใช้ต้องแก้ (ระบุบรรทัด) */
export function substituteDraftPayload(
  drafts: readonly SubstituteLineDraft[],
): { payload: SubstituteDraftPayload; error: null } | { payload: null; error: string } {
  const lines = drafts.map((draft) => {
    const amount = parseBahtInput(draft.amountBaht)
    return {
      lineDate: draft.lineDate.trim(),
      description: draft.description.trim(),
      amountSatang: amount === null ? Number.NaN : amount,
      note: draft.note.trim() === '' ? null : draft.note.trim(),
    }
  })
  const parsed = substituteReceiptDraftSchema.safeParse({ lines })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const lineIndex = issue?.path[1]
    const prefix = typeof lineIndex === 'number' ? `รายการที่ ${lineIndex + 1}: ` : ''
    return { payload: null, error: `${prefix}${issue?.message ?? 'กรอกรายการให้ครบ'}` }
  }
  return { payload: { lines }, error: null }
}

/**
 * บรรทัดของใบที่ยกเลิก → ฟอร์ม "ออกใบใหม่แทน" (มติ PO U117 ข้อ 1 — ดึงรายการ/ยอดมาให้แก้ได้)
 * ไม่มีบรรทัด = บรรทัดว่าง 1 แถววันที่ `fallbackDate`
 */
export function substituteLinesToDrafts(
  lines: readonly SubstituteReceiptLineDto[],
  fallbackDate = '',
  targetTotalSatang?: number,
): SubstituteLineDraft[] {
  const fitted = targetTotalSatang === undefined ? lines : fitSubstituteLinesToTotal(lines, targetTotalSatang, fallbackDate)
  if (fitted.length === 0) return [emptySubstituteLine('line-0', fallbackDate)]
  return fitted.map((line, index) => ({
    key: `line-${index}`,
    lineDate: line.lineDate,
    description: line.description,
    amountBaht: toBahtInput(line.amountSatang),
    note: line.note ?? '',
  }))
}

/**
 * ตรวจซ้ำ staging SV5-R2-01 — ตั้งต้นบรรทัดของใบใหม่ให้ยอดรวมเท่ากับยอดเบิกปัจจุบัน (ค่าที่พัก: ยอดใบต้องเท่ายอดเบิก)
 * แทนยอดของใบที่ยกเลิก: ไม่มีบรรทัด ⇒ 1 บรรทัดยอดเต็ม · บรรทัดเดียว ⇒ ปรับยอดบรรทัดนั้น · หลายบรรทัด ⇒ ปรับส่วนต่าง
 * ที่บรรทัดสุดท้าย (ถ้ายังมากกว่า 0 — ไม่งั้นคงเดิมให้ผู้ใช้แก้เอง) · เป็นแค่ค่าตั้งต้น server ตรวจยอดซ้ำเสมอ
 */
export function fitSubstituteLinesToTotal(
  lines: readonly SubstituteReceiptLineDto[],
  targetTotalSatang: number,
  fallbackDate = '',
): SubstituteReceiptLineDto[] {
  if (!Number.isInteger(targetTotalSatang) || targetTotalSatang <= 0) return [...lines]
  if (lines.length === 0) return [{ lineDate: fallbackDate, description: '', amountSatang: targetTotalSatang, note: null }]
  const total = lines.reduce((sum, line) => sum + line.amountSatang, 0)
  const diff = targetTotalSatang - total
  if (diff === 0) return [...lines]
  const lastIndex = lines.length - 1
  const last = lines[lastIndex]
  if (last === undefined || last.amountSatang + diff <= 0) return [...lines]
  return lines.map((line, index) => (index === lastIndex ? { ...line, amountSatang: line.amountSatang + diff } : line))
}
