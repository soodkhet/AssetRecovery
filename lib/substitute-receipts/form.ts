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

/** ช่องของบรรทัดรายการ — เรียงตามลำดับบนจอในแถว (วันที่ → รายละเอียด → จำนวนเงิน → หมายเหตุ) */
export const SUBSTITUTE_LINE_FIELDS = ['lineDate', 'description', 'amount', 'note'] as const
export type SubstituteLineField = (typeof SUBSTITUTE_LINE_FIELDS)[number]

/** ตำแหน่งที่ผิดในตารางรายการ — แถว (0-based) + ช่อง · ใช้แสดงข้อความใต้แถวนั้น + เลื่อน/โฟกัสช่องที่ผิดจริง (ตรวจซ้ำ staging SV5-R4-01) */
export interface SubstituteLineIssueAt {
  lineIndex: number
  /** `key` ของแถว — editor จับคู่ด้วย key (ลบ/แทรกแถวหลังแสดงข้อความแล้ว ข้อความไม่ย้ายไปแถวอื่น) */
  lineKey: string
  field: SubstituteLineField
}

/** key ใน payload/schema → ช่องบนจอ (`amountSatang` กรอกเป็นช่อง "จำนวนเงิน (บาท)") */
const PAYLOAD_KEY_TO_FIELD: Readonly<Partial<Record<string, SubstituteLineField>>> = {
  lineDate: 'lineDate',
  description: 'description',
  amountSatang: 'amount',
  note: 'note',
}

/** id ของช่องกรอกในแถว — `<NoReceiptLinesEditor>` ใส่ให้ input · ข้อความ error ของแถวชี้กลับด้วย id นี้ */
export function substituteLineInputId(idPrefix: string, lineIndex: number, field: SubstituteLineField): string {
  return `${idPrefix}-line-${lineIndex}-${field}`
}

/**
 * ฟอร์ม → payload ของ API · ผิดข้อใด = `{ error, at }` ข้อความของช่องแรกที่ผู้ใช้ต้องแก้ (ระบุบรรทัด) —
 * ไล่ตามลำดับบนจอ: แถวบนก่อน แล้วช่องซ้าย→ขวาในแถว (ไม่พึ่งลำดับ issue ของ Zod) · `at: null` = ผิดระดับทั้งตาราง
 * (เช่นไม่มีบรรทัด/เกินจำนวนบรรทัด)
 */
export function substituteDraftPayload(
  drafts: readonly SubstituteLineDraft[],
):
  | { payload: SubstituteDraftPayload; error: null; at: null }
  | { payload: null; error: string; at: SubstituteLineIssueAt | null } {
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
  if (parsed.success) return { payload: { lines }, error: null, at: null }

  let first: { message: string; at: SubstituteLineIssueAt | null } | null = null
  let firstRank = Number.POSITIVE_INFINITY
  for (const issue of parsed.error.issues) {
    const [root, lineIndex, key] = issue.path
    const field = typeof key === 'string' && Object.hasOwn(PAYLOAD_KEY_TO_FIELD, key) ? PAYLOAD_KEY_TO_FIELD[key] : undefined
    const lineKey = typeof lineIndex === 'number' ? drafts[lineIndex]?.key : undefined
    if (root !== 'lines' || typeof lineIndex !== 'number' || field === undefined || lineKey === undefined) {
      // ผิดระดับทั้งตาราง (ไม่มี/เกินจำนวนบรรทัด) — มาก่อนข้อผิดของแถวใด ๆ
      if (firstRank > -1) {
        first = { message: issue.message, at: null }
        firstRank = -1
      }
      continue
    }
    const rank = lineIndex * SUBSTITUTE_LINE_FIELDS.length + SUBSTITUTE_LINE_FIELDS.indexOf(field)
    if (rank < firstRank) {
      first = { message: `รายการที่ ${lineIndex + 1}: ${issue.message}`, at: { lineIndex, lineKey, field } }
      firstRank = rank
    }
  }
  return { payload: null, error: first?.message ?? 'กรอกรายการให้ครบ', at: first?.at ?? null }
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
