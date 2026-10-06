import { nextPeriodKey, periodYearCe, type PeriodKey } from '@/lib/accounting/period'
import { fmtDate, nextBusinessDay } from '@/lib/format/datetime'
import { fmtSatang } from '@/lib/format/money'
import type {
  PayeeType,
  WhtCertificateStatus,
  WhtCondition,
  WhtDeliveryFormat,
  WhtFilingForm,
  WhtFilingStatus,
} from '@/lib/generated/prisma/enums'
import { formatBranch } from '@/lib/format/branch'
import { bahtInWords } from '@/lib/payout/baht-text'
import { toBangkokDateOnly } from '@/lib/revenue/revenue'
import {
  INCOME_TYPE_TEXT_40_1,
  INCOME_TYPE_TEXT_40_2,
  INCOME_TYPE_TEXT_CORPORATE,
  usesPerPayeeWhtRate,
  WHT_FILING_METHOD_SUFFIX,
  type WhtCertificateMode,
  type WhtFilingMethod,
  type WhtIncomeCategory,
} from '@/lib/settings/wht-policy'
import { WhtError } from '@/lib/wht/errors'

/**
 * กติกาของหนังสือรับรองหัก ณ ที่จ่าย + สรุปรอบนำส่ง (ไฟล์ 33) — **pure ล้วน ไม่มี I/O** ใช้ร่วม FE/BE
 *
 * ### กติกาที่ห้ามหลุด
 * - **ใบ 50 ทวิ ออกตามรูปแบบที่ snapshot ไว้กับรอบจ่าย** (มติ PO 05/10/2569 UAT U4): ต่อผู้รับต่อรอบ
 *   (ค่าเริ่มต้นใหม่) หรือ 1 รายการที่หักภาษี = 1 ใบ (เดิม/รอบเก่า) — `groupCertificateSources()` · เกิดจาก payout ที่ `completed` เท่านั้น
 *   (`33` §9 · §17) — รายการที่ `wht = 0` (เช่นเงินทดรองจ่าย A4) **ไม่ออกใบ** เพราะใบ 50 ทวิ
 *   คือหลักฐาน "ภาษีที่หักไว้" ไม่มีภาษีก็ไม่มีอะไรให้รับรอง (ดู `shouldIssueCertificate()`)
 * - **ใบที่ออกแล้วแก้ยอดไม่ได้** — ผิดต้อง `active → cancelled` (terminal, ห้ามลบ/ห้าม reverse)
 *   แล้วออกใบใหม่ที่อ้าง `replaces_certificate_id` กลับฉบับเดิม (`33` §10 · `02` §13)
 * - **ใบที่ `cancelled` ไม่ถูกนับใน `pnd3_total`/`pnd53_total`** (`33` §9 · §16) ⇒ ทุกการรวมยอด
 *   ต้องผ่าน `summarizeFilingTotals()` ตัวเดียว ห้าม `reduce` เองที่อื่น
 * - **`FILING_OVERDUE_WARNING` เป็นคำเตือน ไม่ block** (`33` §11 · Rule 04 — 1 ใน warn-only ของ `24`)
 * - อัตรา/ฐาน WHT **ไม่ได้คิดที่นี่** — คิดตอนสร้างรอบจ่าย (ไฟล์ 17 ผ่าน `calculateWhtForPayee()`)
 *   โมดูลนี้อ่าน snapshot ของ `payout_batch_items` มารับรองเท่านั้น (Rule 01)
 *
 * ### สิ่งที่ยังไม่มีในสคีมา (`02` ชนะไฟล์ 33 ตามลำดับเอกสารขัดกัน — `02_OPEN_DECISIONS` D11/D15)
 * - เลขที่ใบออกจากชุดเลขกลาง `wht_certificate` (มติ PO U102 · ล็อกแถวชุดเลข FOR UPDATE)
 * - (ปิดแล้ว — มติ PO U94 ข้อ 1/D15) ที่อยู่/คำนำหน้า/สาขา/เงื่อนไขการหักของผู้ถูกหักอยู่ใน `payee_profiles`
 *   และ **snapshot ลงใบตอนออก** (U96 #4) — เอกสาร/ไฟล์ส่งบัญชีอ่านจาก snapshot เท่านั้น
 */

// ── สิทธิ์ (`25` §7.5 · `33` §12) ────────────────────────────────────────────

/** ออกหนังสือรับรอง / mark filed = บัญชี manage · การเงิน view (`25` §7.5) */
export const MANAGE_WHT = 'manage_wht'

/** ผู้ที่เปิดดูทะเบียนใบ 50 ทวิ/สรุปรอบนำส่งได้ (`33` §12 — การเงินอ่านอย่างเดียว) */
export const WHT_READ_CAPABILITIES = [MANAGE_WHT] as const

// ── ป้ายข้อความ ─────────────────────────────────────────────────────────────

export const WHT_CERTIFICATE_STATUS_LABEL: Record<WhtCertificateStatus, string> = {
  active: 'ใช้งาน',
  cancelled: 'ยกเลิก',
}

export const WHT_FILING_STATUS_LABEL: Record<WhtFilingStatus, string> = {
  pending: 'รอยื่นแบบ',
  filed: 'ยื่นแล้ว',
}

export const WHT_FILING_FORM_LABEL: Record<WhtFilingForm, string> = {
  PND3: 'ภ.ง.ด.3 (บุคคลธรรมดา)',
  PND53: 'ภ.ง.ด.53 (นิติบุคคล)',
  PND1: 'ภ.ง.ด.1 (เงินได้ 40(1)/40(2))',
}

/** ชื่อแบบสั้น (ไม่มีคำอธิบาย) — ใช้ในประโยคท้ายใบ 50 ทวิ */
export const WHT_FILING_FORM_SHORT_LABEL: Record<WhtFilingForm, string> = {
  PND3: 'ภ.ง.ด.3',
  PND53: 'ภ.ง.ด.53',
  PND1: 'ภ.ง.ด.1',
}

export const WHT_DELIVERY_FORMAT_LABEL: Record<WhtDeliveryFormat, string> = {
  paper: 'กระดาษ (พิมพ์ส่งผู้ถูกหัก)',
  e_withholding: 'e-Withholding Tax (ส่งผ่านระบบอิเล็กทรอนิกส์)',
}

export const WHT_CERTIFICATE_TITLE = 'หนังสือรับรองการหักภาษี ณ ที่จ่าย'
export const WHT_CERTIFICATE_TITLE_EN = 'WITHHOLDING TAX CERTIFICATE'
/** ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร — พิมพ์ใต้ชื่อเอกสาร (`28` §6.3) */
export const WHT_CERTIFICATE_LEGAL_NOTE = 'ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร'

// ── เงื่อนไขการออกใบ (`33` §9) ──────────────────────────────────────────────

/**
 * รายการจ่ายนี้ต้องออกใบ 50 ทวิ หรือไม่ — **หักภาษีจริงเท่านั้น**
 *
 * `wht_satang = 0` เกิดได้ 2 กรณี: ยอดต่ำกว่าเกณฑ์ 1,000 บาท (`22` §6.9) และเงินทดรองจ่าย
 * ที่ไม่ใช่เงินได้ (A4) — ทั้งคู่ไม่มีภาษีถูกหักไว้จึงไม่มีสิ่งที่ต้องรับรอง
 */
export function shouldIssueCertificate(item: { whtSatang: number }): boolean {
  return item.whtSatang > 0
}

/**
 * **ข้อยกเว้นของ `shouldIssueCertificate()`** — เงินได้ 40(1)/40(2) อัตรา 0% (มติ PO 05/10/2569 UAT U16 ·
 * U33 "40(1) ใช้กติกาเดียวกับ 40(2)")
 *
 * ค่าตั้ง `issueZeroRate402Certificate` เปิด (ค่าเริ่มต้น) ⇒ ผู้รับ 40(1)/40(2) ที่ภาษีรวม 0 แต่มีเงินได้ในฐาน
 * ได้ใบ 50 ทวิ ยอดภาษี 0 (เงินได้ = ฐานที่จ่าย) และนับในสรุป ภ.ง.ด.1 — ผู้รับใช้ยื่น ภ.ง.ด.90/91
 * 40(2) ไม่มีเกณฑ์ขั้นต่ำ (`22` §6.9.1) ⇒ ภาษี 0 ทั้งที่มีเงินได้ในฐาน = อัตรา 0% เท่านั้น
 * **40(8) ต่ำกว่าเกณฑ์ ฿1,000 ไม่เกี่ยว** — ยังไม่ออกใบเหมือนเดิม · ค่าตั้งปิด/รอบเก่า = ไม่ออก
 */
export function shouldIssueZeroRate402Certificate(input: {
  issueZeroRate402Certificate: boolean
  incomeCategory: WhtIncomeCategory | null
  whtSatang: number
  /** ยอดเงินได้ในฐาน WHT ของกลุ่ม — 0 = ไม่มีเงินได้ (เช่นทุกรายการนอกฐาน) ไม่มีอะไรให้รับรอง */
  grossSatang: number
}): boolean {
  return (
    input.issueZeroRate402Certificate &&
    usesPerPayeeWhtRate(input.incomeCategory) &&
    input.whtSatang === 0 &&
    input.grossSatang > 0
  )
}

/**
 * แบบที่ต้องยื่น — ตัดสินจาก**ชนิดผู้รับ**เป็นหลัก ไม่ใช่ค่าที่ตั้งใน Tax Profile:
 * - **นิติบุคคล ⇒ ภ.ง.ด.53 เสมอ** (มติ PO 06/10/2569 UAT U96 #2 · ม.69 ทวิ)
 * - บุคคลธรรมดาเงินได้ 40(1)/40(2) ⇒ **ภ.ง.ด.1** (มติ PO 05/10/2569 UAT U7 · U33)
 * - **บุคคลธรรมดาอื่น ๆ ⇒ ภ.ง.ด.3 เสมอ** แม้ Tax Profile ตั้งเป็น ภ.ง.ด.53 (มติ O57 — ภ.ง.ด.53 ใช้กับนิติบุคคลเท่านั้น)
 *   ⇒ `taxProfileFilingForm` ไม่มีผลต่อผลลัพธ์แล้ว (คงพารามิเตอร์ไว้ให้ผู้เรียกเดิม + เทสต์ยืนยันว่าไม่ชนะชนิดผู้รับ)
 */
export function filingFormOf(input: {
  taxProfileFilingForm: WhtFilingForm | null
  payeeType: PayeeType
  /** snapshot `payout_batch_items.wht_income_category` — `null` = รอบเก่า (40(8)) */
  incomeCategory?: WhtIncomeCategory | null
}): WhtFilingForm {
  // นิติบุคคล ⇒ ภ.ง.ด.53 เสมอ ไม่ว่าโหมดค่าตั้ง/Tax Profile จะเป็นอะไร (มติ PO 06/10/2569 UAT U96 #2 · ม.69 ทวิ)
  if (input.payeeType === 'corporate') return 'PND53'
  if (usesPerPayeeWhtRate(input.incomeCategory)) return 'PND1'
  // มติ O57 — บุคคลธรรมดายื่น ภ.ง.ด.3 เสมอ (Tax Profile ที่ตั้ง ภ.ง.ด.53/ภ.ง.ด.1 ไม่ชนะชนิดผู้รับ)
  return 'PND3'
}

/** ประเภทเงินได้พึงประเมิน (`28` §6.3 ฟิลด์บังคับ) — จาก Tax Profile ที่ snapshot ไว้ */
export const DEFAULT_INCOME_TYPE = 'ค่าจ้างทำของ มาตรา 40(8)'

/**
 * 40(1)/40(2) ⇒ ข้อความของมาตรานั้นเสมอ (Tax Profile เป็นของ 40(8)) · 40(8) ⇒ ข้อความจาก Tax Profile
 * (มติ PO 05/10/2569 UAT U7 · U33 — 50 ทวิ ต้องระบุประเภท 40(1) ให้ตรงแถวของแบบ)
 */
export function incomeTypeOf(
  taxProfileIncomeType: string | null,
  incomeCategory: WhtIncomeCategory | null = null,
  payeeType: PayeeType = 'individual',
): string {
  // นิติบุคคล (U96 #2): ไม่ใช่เงินได้มาตรา 40 — ข้อความ Tax Profile ที่อ้าง "มาตรา 40" (หรือว่าง) ใช้หมวดค่าบริการแทน
  if (payeeType === 'corporate') {
    const text = (taxProfileIncomeType ?? '').trim()
    return text === '' || /40\s*\(/.test(text) ? INCOME_TYPE_TEXT_CORPORATE : text
  }
  if (incomeCategory === 'sec_40_1') return INCOME_TYPE_TEXT_40_1
  if (incomeCategory === 'sec_40_2') return INCOME_TYPE_TEXT_40_2
  const trimmed = (taxProfileIncomeType ?? '').trim()
  return trimmed === '' ? DEFAULT_INCOME_TYPE : trimmed
}

// ── การจัดกลุ่มรายการเป็นใบ 50 ทวิ (มติ PO 05/10/2569 UAT U4) ─────────────────

export interface CertificateSourceItem {
  /** `expense_records.id` */
  id: string
  payeeId: string
  grossSatang: number
  whtSatang: number
  /** snapshot `payout_batch_items.wht_base_included` — รายการนอกฐานไม่ใช่เงินได้ ไม่พิมพ์ในยอดจ่ายของใบ */
  whtBaseIncluded: boolean
  /** snapshot `payout_batch_items.wht_income_category` — ใช้ตัดสินใบ 40(2) อัตรา 0% (U16) · ไม่ระบุ = 40(8) */
  incomeCategory?: WhtIncomeCategory | null
}

export interface CertificateGroupingOptions {
  /** snapshot ค่าตั้ง U16 ของรอบจ่าย — ไม่ระบุ = `false` (พฤติกรรมเดิม: ภาษี 0 ไม่ออกใบ) */
  issueZeroRate402Certificate?: boolean
}

export interface CertificateGroup<T extends CertificateSourceItem> {
  /** รายการแรกของกลุ่ม (ลำดับ input) — ใบผูก `expense_record_id` กับรายการนี้ (กันออกซ้ำด้วย unique เดิม) */
  anchor: T
  members: T[]
  mode: WhtCertificateMode
  /** ยอดเงินได้ที่จ่าย = ผลรวม gross ของรายการที่อยู่ในฐาน */
  grossSatang: number
  whtSatang: number
}

/**
 * จัดรายการของรอบจ่ายเป็นใบ 50 ทวิ ตามรูปแบบที่ snapshot ไว้กับรอบ
 * - `per_item` (เดิม) = 1 รายการที่หักภาษี = 1 ใบ
 * - `per_payee_batch` (ค่าเริ่มต้นใหม่) = 1 ใบต่อผู้รับ รวมทุกรายการของผู้รับในรอบ
 *
 * ทั้งสองแบบ **ยอดภาษีรวมเท่ากันเสมอ** (ผลรวมของ snapshot รายการเดียวกัน) · กลุ่มที่ภาษีรวม = 0 ไม่ออกใบ
 * (`shouldIssueCertificate()`) — ยกเว้นเงินได้ 40(2) อัตรา 0% เมื่อค่าตั้ง U16 เปิด
 * (`shouldIssueZeroRate402Certificate()`) · ลำดับกลุ่ม/สมาชิกตามลำดับ input (ผู้เรียกเรียงตามเวลาสร้าง)
 */
export function groupCertificateSources<T extends CertificateSourceItem>(
  items: readonly T[],
  mode: WhtCertificateMode,
  options: CertificateGroupingOptions = {},
): CertificateGroup<T>[] {
  const issueZeroRate402Certificate = options.issueZeroRate402Certificate ?? false
  const buckets = new Map<string, T[]>()
  items.forEach((item) => {
    const key = mode === 'per_item' ? item.id : item.payeeId
    const members = buckets.get(key) ?? []
    members.push(item)
    buckets.set(key, members)
  })
  const groups: CertificateGroup<T>[] = []
  for (const members of buckets.values()) {
    const whtSatang = members.reduce((sum, member) => sum + member.whtSatang, 0)
    const grossSatang =
      mode === 'per_item'
        ? members[0]!.grossSatang
        : members.filter((member) => member.whtBaseIncluded).reduce((sum, member) => sum + member.grossSatang, 0)
    const zeroRate402 = shouldIssueZeroRate402Certificate({
      issueZeroRate402Certificate,
      // ประเภทเงินได้เป็นระดับผู้รับต่อรอบ ⇒ ทุกรายการของผู้รับเหมือนกัน
      incomeCategory: members[0]!.incomeCategory ?? null,
      whtSatang,
      // เฉพาะเงินได้ในฐาน — รายการนอกฐาน (ค่าที่พัก/เบิกตามใบเสร็จ) ไม่ใช่เงินได้ ไม่ทำให้เกิดใบ
      grossSatang: members.filter((member) => member.whtBaseIncluded).reduce((sum, m) => sum + m.grossSatang, 0),
    })
    if (!shouldIssueCertificate({ whtSatang }) && !zeroRate402) continue
    groups.push({ anchor: members[0]!, members, mode, grossSatang, whtSatang })
  }
  return groups
}

// ── เลขที่หนังสือรับรอง ──────────────────────────────────────────────────────
// ตัวเดินเลขย้ายไปชุดเลขกลาง `document_number_series` ชนิด `wht_certificate` แล้ว (มติ PO U102 —
// ค่าเริ่มต้น `WHT-<พ.ศ.>-NNN` รีเซ็ตรายปีตามปีที่จ่าย · ล็อกรูปแบบหลังออกฉบับแรก) — ดู `lib/document-numbering/`

// ── กำหนดเวลานำส่ง (`33` §6.2/§7.2) ─────────────────────────────────────────

/**
 * วันกำหนดยื่นตาม**วิธียื่น** (มติ PO 05/10/2569 UAT U45 · ประมวลรัษฎากร ม.59): ออนไลน์ (e-Filing) = วันที่ **15**
 * ของเดือนถัดไป · แบบกระดาษ = วันที่ **7** · ค่าเริ่มต้น = ออนไลน์ (ค่าตั้งใน `wht_policy_history.filing_method`)
 * ตรงเสาร์/อาทิตย์หรือวันหยุดในปฏิทินขององค์กร ⇒ **เลื่อนเป็นวันทำการถัดไป** (มติ PO 06/10/2569 UAT U93 —
 * แทนข้อ "ไม่เลื่อนตามวันหยุด" ของ U45) · คืนเป็น date-only UTC เหมือนคอลัมน์ `DATE` (Rule 01)
 */
export const FILING_DUE_DAY_BY_METHOD: Readonly<Record<WhtFilingMethod, number>> = { online: 15, paper: 7 }

/** @deprecated ใช้ `FILING_DUE_DAY_BY_METHOD.online` — คงไว้ให้ผู้เรียกเดิม */
export const FILING_DUE_DAY_OF_NEXT_MONTH = FILING_DUE_DAY_BY_METHOD.online

/** วันกำหนดยื่น**ตามปฏิทิน** (ก่อนเลื่อนวันหยุด) — 15 หรือ 7 ของเดือนถัดไปตามวิธียื่น */
export function filingNominalDueDateOf(period: PeriodKey, method: WhtFilingMethod = 'online'): Date {
  const next = nextPeriodKey(period)
  return new Date(Date.UTC(periodYearCe(next), next.month - 1, FILING_DUE_DAY_BY_METHOD[method]))
}

/**
 * วันกำหนดยื่นจริง = วันตามปฏิทิน เลื่อนเป็นวันทำการถัดไปถ้าตรงเสาร์/อาทิตย์/วันหยุด (U93)
 * `holidays` = คีย์ `YYYY-MM-DD` ของวันหยุดองค์กร (`loadHolidayKeys()`) — ไม่ส่ง = เลื่อนเฉพาะเสาร์/อาทิตย์
 */
export function filingDueDateOf(
  period: PeriodKey,
  method: WhtFilingMethod = 'online',
  holidays: ReadonlySet<string> | readonly string[] = [],
): Date {
  return nextBusinessDay(filingNominalDueDateOf(period, method), holidays)
}

/**
 * วันที่ใช้ resolve ค่าตั้ง "วิธียื่น" ของงวด = **วันที่ 1 ของเดือนที่ยื่น** (เดือนถัดจากงวด) — ค่าตั้งที่มีผล
 * ก่อนหรือในวันนั้นชนะ (ค่าตั้ง effective-dated ตั้งย้อนหลังไม่ได้ ⇒ งวดที่เดือนยื่นเริ่มไปแล้วไม่ถูกเปลี่ยนวิธีย้อนหลัง)
 */
export function filingMethodResolveDate(period: PeriodKey): Date {
  const next = nextPeriodKey(period)
  return new Date(Date.UTC(periodYearCe(next), next.month - 1, 1))
}

/** ต่อท้ายป้ายวันกำหนดยื่นเมื่อถูกเลื่อน (U93) */
export const FILING_DUE_SHIFTED_SUFFIX = '(เลื่อนจากวันหยุด)'

/**
 * วันกำหนดยื่นบนจอ — ไม่ถูกเลื่อน: "16/11/2569" · ถูกเลื่อน (U93): "15/11/2569 → 16/11/2569 (เลื่อนจากวันหยุด)"
 * `nominalDate` = วันตามปฏิทินก่อนเลื่อน (`filingNominalDueDateOf()`) — ไม่ส่ง/เท่ากัน = ไม่แสดงการเลื่อน
 */
export function filingDueDateText(dueDate: Date | string, nominalDate?: Date | string | null): string {
  const due = fmtDate(dueDate)
  if (nominalDate === undefined || nominalDate === null) return due
  const nominal = fmtDate(nominalDate)
  return nominal === due ? due : `${nominal} → ${due} ${FILING_DUE_SHIFTED_SUFFIX}`
}

/** ป้ายวันกำหนดยื่นพร้อมวิธี — "15/11/2569 (ยื่นออนไลน์)" (วันที่ พ.ศ. ผ่าน `fmtDate`) · เลื่อนแล้วแสดงทั้งสองวัน */
export function filingDueLabel(
  dueDate: Date | string,
  method: WhtFilingMethod,
  nominalDate?: Date | string | null,
): string {
  return `${filingDueDateText(dueDate, nominalDate)} ${WHT_FILING_METHOD_SUFFIX[method]}`
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** จำนวนวันคงเหลือก่อนถึงกำหนด (ติดลบ = เลยกำหนดแล้ว) — นับตามวันปฏิทิน**ไทย** ไม่ใช่ชั่วโมง */
export function daysUntilFilingDue(dueDate: Date, now: Date = new Date()): number {
  const today = toBangkokDateOnly(now).getTime()
  const due = toBangkokDateOnly(dueDate).getTime()
  return Math.round((due - today) / MS_PER_DAY)
}

/** เลยกำหนดแล้วแต่ยังไม่ยื่น (`33` §11) — `filed` แล้วไม่ถือว่าเลยกำหนดไม่ว่ากรณีใด */
export function isFilingOverdue(status: WhtFilingStatus, dueDate: Date, now: Date = new Date()): boolean {
  return status === 'pending' && daysUntilFilingDue(dueDate, now) < 0
}

export interface FilingWarning {
  code: 'FILING_OVERDUE_WARNING'
  title: string
  message: string
}

/**
 * คำเตือนกำหนดนำส่ง — **ไม่ block** (`24` §6.8 warn-only) · `null` = ยังไม่ต้องเตือน
 * (ยื่นแล้ว หรือยังไม่เลยกำหนด)
 */
export function filingOverdueWarning(
  summary: {
    periodLabel: string
    status: WhtFilingStatus
    filingDueDate: Date
    filingMethod?: WhtFilingMethod
    /** วันตามปฏิทินก่อนเลื่อนวันหยุด (U93) — ส่งมาเพื่อให้ข้อความบอกว่าเลื่อน */
    filingNominalDueDate?: Date | null
  },
  now: Date = new Date(),
): FilingWarning | null {
  if (!isFilingOverdue(summary.status, summary.filingDueDate, now)) return null
  const overdueDays = Math.abs(daysUntilFilingDue(summary.filingDueDate, now))
  return {
    code: 'FILING_OVERDUE_WARNING',
    title: `เลยกำหนดนำส่ง ภ.ง.ด.3/53 ของรอบ ${summary.periodLabel} แล้ว`,
    message:
      `กำหนดนำส่งคือ ${filingDueLabel(summary.filingDueDate, summary.filingMethod ?? 'online', summary.filingNominalDueDate)} (เลยมา ${overdueDays} วัน) — ` +
      'ยื่นล่าช้ามีเบี้ยปรับ/เงินเพิ่มตามประมวลรัษฎากร ให้ประสานสำนักงานบัญชีทันที',
  }
}

// ── ยอดรวมของรอบนำส่ง (`33` §7.2 · §16) ─────────────────────────────────────

export interface FilingTotalSource {
  status: WhtCertificateStatus
  filingForm: WhtFilingForm
  whtSatang: number
  grossSatang: number
}

export interface FilingTotals {
  pnd3Satang: number
  pnd53Satang: number
  /** ภ.ง.ด.1 — เงินได้ 40(2) (มติ PO 05/10/2569 UAT U7) */
  pnd1Satang: number
  /**
   * จำนวนใบ/เงินได้ของ ภ.ง.ด.1 — รวมใบ 40(2) อัตรา 0% ที่ภาษี 0 (มติ PO 05/10/2569 UAT U16)
   * ภ.ง.ด.1 ต้องแสดงรายผู้มีเงินได้แม้ไม่มีภาษีถูกหัก ⇒ ยอดภาษีอย่างเดียวไม่พอ
   */
  pnd1Count: number
  pnd1GrossSatang: number
  /** จำนวนใบที่นับยอด (ไม่รวมใบที่ยกเลิก) */
  activeCount: number
  cancelledCount: number
  grossSatang: number
}

/**
 * รวมยอด WHT ของรอบแยกตามแบบ — **ใบที่ `cancelled` ไม่ถูกนับ** (`33` §9/§16)
 * บ้านเดียวของกฎนี้: ทั้งคอลัมน์ในตาราง `wht_filing_summaries` และตัวเลขบนจอมาจากฟังก์ชันนี้
 */
export function summarizeFilingTotals(rows: readonly FilingTotalSource[]): FilingTotals {
  return rows.reduce<FilingTotals>(
    (totals, row) => {
      if (row.status === 'cancelled') return { ...totals, cancelledCount: totals.cancelledCount + 1 }
      return {
        pnd3Satang: totals.pnd3Satang + (row.filingForm === 'PND3' ? row.whtSatang : 0),
        pnd53Satang: totals.pnd53Satang + (row.filingForm === 'PND53' ? row.whtSatang : 0),
        pnd1Satang: totals.pnd1Satang + (row.filingForm === 'PND1' ? row.whtSatang : 0),
        pnd1Count: totals.pnd1Count + (row.filingForm === 'PND1' ? 1 : 0),
        pnd1GrossSatang: totals.pnd1GrossSatang + (row.filingForm === 'PND1' ? row.grossSatang : 0),
        activeCount: totals.activeCount + 1,
        cancelledCount: totals.cancelledCount,
        grossSatang: totals.grossSatang + row.grossSatang,
      }
    },
    {
      pnd3Satang: 0,
      pnd53Satang: 0,
      pnd1Satang: 0,
      pnd1Count: 0,
      pnd1GrossSatang: 0,
      activeCount: 0,
      cancelledCount: 0,
      grossSatang: 0,
    },
  )
}

// ── ยื่นเพิ่มเติม (มติ PO 07/10/2569 U127) ──────────────────────────────────────

export interface FilingAmounts {
  pnd1Satang: number
  pnd3Satang: number
  pnd53Satang: number
}

export interface SupplementaryFilingDiff {
  /** ยอดปัจจุบันจากใบที่มีผล − ยอดที่ยื่นไปแล้ว (ต่อแบบ) — บวก = ต้องนำส่งเพิ่ม · ลบ = ยื่นเกิน */
  pnd1Satang: number
  pnd3Satang: number
  pnd53Satang: number
  totalSatang: number
}

/**
 * ยอดต่างระหว่าง "ยอดที่ยื่นแล้ว" (คงเดิมบนรอบ `filed`) กับ "ยอดปัจจุบัน" (ใบ 50 ทวิ ที่ยังมีผลของเดือนนั้น)
 * — ใช้แสดงบนรอบที่ติดธงต้องยื่นเพิ่มเติม · ไม่ปัด ไม่ตัด (สตางค์ล้วน)
 */
export function supplementaryFilingDiff(filed: FilingAmounts, current: FilingAmounts): SupplementaryFilingDiff {
  const pnd1Satang = current.pnd1Satang - filed.pnd1Satang
  const pnd3Satang = current.pnd3Satang - filed.pnd3Satang
  const pnd53Satang = current.pnd53Satang - filed.pnd53Satang
  return { pnd1Satang, pnd3Satang, pnd53Satang, totalSatang: pnd1Satang + pnd3Satang + pnd53Satang }
}

/** ล้างธงได้เฉพาะรอบที่ยื่นแล้วและยังติดธงอยู่ */
export function assertSupplementaryFilingMarkable(input: {
  status: WhtFilingStatus
  supplementaryRequiredAt: Date | null
}): void {
  if (input.status !== 'filed' || input.supplementaryRequiredAt === null) {
    throw new WhtError('WHT_SUPPLEMENTARY_FILING_NOT_REQUIRED', {
      detail: 'รอบนี้ไม่มีรายการที่ต้องยื่นเพิ่มเติม',
    })
  }
}

// ── State machine (`23` §6.11 · `33` §9/§10) ────────────────────────────────

/** `active → cancelled` เท่านั้น — `cancelled` เป็น terminal (ห้ามลบ ห้าม reverse) */
export function assertCertificateCancellable(status: WhtCertificateStatus): void {
  if (status === 'active') return
  throw new WhtError('WHT_CERTIFICATE_INVALID_STATUS', {
    detail: `cancel at ${status}`,
    context: { currentStatus: status },
  })
}

/** เหตุผลยกเลิกบังคับเสมอ (`33` §11) — คืนค่าที่ trim แล้วให้ผู้เรียกเก็บลง `cancel_reason` */
export function requireWhtCancelReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim()
  if (trimmed === '') throw new WhtError('WHT_CANCEL_REQUIRES_REASON')
  return trimmed
}

/** `pending → filed` เท่านั้น — ยื่นแล้ว mark ซ้ำไม่ได้ (`33` §9 · `23` §6.11) */
export function assertFilingMarkable(status: WhtFilingStatus): void {
  if (status === 'pending') return
  throw new WhtError('WHT_FILING_ALREADY_FILED', { context: { currentStatus: status } })
}

// ── แบบฟอร์มทางการ 50 ทวิ (มติ PO 06/10/2569 UAT U96 #13) ─────────────────────

/** ช่องแบบ ภ.ง.ด. บนหนังสือรับรอง 50 ทวิ ตามแบบของกรมสรรพากร (เรียงตามแบบ — 7 ช่อง) */
export const WHT_FORM_FILING_BOXES = [
  { key: 'PND1A', label: '(1) ภ.ง.ด.1ก' },
  { key: 'PND1A_SPECIAL', label: '(2) ภ.ง.ด.1ก พิเศษ' },
  { key: 'PND2', label: '(3) ภ.ง.ด.2' },
  { key: 'PND3', label: '(4) ภ.ง.ด.3' },
  { key: 'PND2A', label: '(5) ภ.ง.ด.2ก' },
  { key: 'PND3A', label: '(6) ภ.ง.ด.3ก' },
  { key: 'PND53', label: '(7) ภ.ง.ด.53' },
] as const

export type WhtFormFilingBox = (typeof WHT_FORM_FILING_BOXES)[number]['key']

/**
 * แบบที่ยื่นจริง → ช่องที่ติ๊กบนใบ 50 ทวิ — ภ.ง.ด.1 รายเดือน (เงินได้ 40(1)/40(2)) ติ๊ก **ภ.ง.ด.1ก**
 * (แบบสรุปรายปีที่ผู้มีเงินได้ใช้อ้างอิง — แนวปฏิบัติของแบบ 50 ทวิ) · ภ.ง.ด.3 / ภ.ง.ด.53 ติ๊กช่องของตัวเอง
 */
export function officialFilingBoxOf(filingForm: WhtFilingForm): WhtFormFilingBox {
  if (filingForm === 'PND1') return 'PND1A'
  return filingForm
}

/** แถวประเภทเงินได้บนแบบ 50 ทวิ (ข้อความย่อตามแบบ) — แถว 4 แยก (ก)/(ข) ในแบบจริง รวมเป็นแถวเดียวที่นี่ */
export const WHT_FORM_INCOME_ROWS = [
  { no: '1', label: 'เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40(1)' },
  { no: '2', label: 'ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40(2)' },
  { no: '3', label: 'ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40(3)' },
  { no: '4', label: 'ดอกเบี้ย ฯลฯ ตามมาตรา 40(4)(ก) / เงินปันผล ส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40(4)(ข)' },
  {
    no: '5',
    label:
      'การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น ค่าจ้างทำของ ค่าบริการ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ฯลฯ',
  },
  { no: '6', label: 'อื่น ๆ (ระบุ)' },
] as const

export type WhtFormIncomeRow = (typeof WHT_FORM_INCOME_ROWS)[number]['no']

/**
 * แถวของแบบที่ยอดเงินของใบนี้ลง — 40(1) = แถว 1 · 40(2) = แถว 2 · ค่าจ้างทำของ 40(8) ของบุคคลธรรมดา และ
 * ค่าบริการของนิติบุคคล (U96 #2) = แถว 5 (หัก ณ ที่จ่ายตาม ม.3 เตรส) · `incomeCategory` = snapshot ของรอบจ่าย
 */
export function officialIncomeRowOf(input: {
  incomeCategory: WhtIncomeCategory | null
  payeeType: PayeeType
}): WhtFormIncomeRow {
  if (input.payeeType === 'corporate') return '5'
  if (input.incomeCategory === 'sec_40_1') return '1'
  if (input.incomeCategory === 'sec_40_2') return '2'
  return '5'
}

/** ช่อง "ผู้จ่ายเงิน" บนแบบ 50 ทวิ — (1)–(3) ตรง enum `wht_condition` · (4) อื่น ๆ ไม่ใช้ในระบบ (แสดงว่าง) */
export const WHT_FORM_CONDITION_BOXES = [
  { key: 'withhold', label: '(1) หัก ณ ที่จ่าย' },
  { key: 'pay_always', label: '(2) ออกให้ตลอดไป' },
  { key: 'pay_once', label: '(3) ออกให้ครั้งเดียว' },
  { key: 'other', label: '(4) อื่น ๆ (ระบุ)' },
] as const satisfies readonly { key: WhtCondition | 'other'; label: string }[]

export interface FilingSequenceEntry {
  payeeId: string
  certificateNumber: string
  status: WhtCertificateStatus
}

/** เลขที่ใบเรียงแบบตัวเลข (`WHT-2569-1000` มาหลัง `WHT-2569-999`) */
function compareCertificateNumber(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true })
}

/**
 * **ลำดับที่ในแบบ ภ.ง.ด.** (ช่อง "ลำดับที่ … ในแบบ" ของ 50 ทวิ) — ผู้รับแต่ละรายได้ลำดับเดียวในแบบเดียวกันของงวด
 * เรียงตามเลขที่หนังสือรับรองใบแรกของผู้รับ (เลขเดินตามเวลาออก) · นับเฉพาะใบที่ใช้งาน (ใบยกเลิกไม่อยู่ในแบบ)
 * ยกเว้นผู้รับเป้าหมายเอง (ใบยกเลิกยังพิมพ์ได้ — ใช้ลำดับ ณ ตำแหน่งเดิม)
 *
 * ผู้เรียกต้องกรอง `entries` ให้เหลือ **งวด + แบบเดียวกัน** ก่อน · ไม่พบผู้รับ = `null`
 */
export function filingSequenceNumber(entries: readonly FilingSequenceEntry[], payeeId: string): number | null {
  const firstNumber = new Map<string, string>()
  for (const entry of entries) {
    if (entry.status !== 'active' && entry.payeeId !== payeeId) continue
    const current = firstNumber.get(entry.payeeId)
    if (current === undefined || compareCertificateNumber(entry.certificateNumber, current) < 0) {
      firstNumber.set(entry.payeeId, entry.certificateNumber)
    }
  }
  const ordered = [...firstNumber.entries()].sort((a, b) => compareCertificateNumber(a[1], b[1]))
  const index = ordered.findIndex(([id]) => id === payeeId)
  return index === -1 ? null : index + 1
}

// ── แบบข้อมูลของเอกสาร PDF (`28` §6.3 · แบบทางการ — มติ PO U96 #13) ─────────

/** คู่สัญญาบนใบ (ผู้มีหน้าที่หัก / ผู้ถูกหัก) — ค่าจาก **snapshot ของใบ** (U96 #4) */
export interface WhtCertificateParty {
  /** ชื่อเต็มที่พิมพ์ (รวมคำนำหน้าแล้ว) */
  name: string
  /** เลขประจำตัวผู้เสียภาษี 13 หลัก — ไม่มี = "—" */
  taxId: string
  /** ที่อยู่บรรทัดเดียว — ไม่มี = "—" */
  address: string
  /** "สำนักงานใหญ่" / "สาขาที่ 00001" — บุคคลธรรมดา = null (ไม่พิมพ์) */
  branchLabel: string | null
}

export interface WhtCertificateDocSource {
  certificateNumber: string
  status: WhtCertificateStatus
  cancelReason: string | null
  cancelledAt: Date | null
  replacesCertificateNumber: string | null
  deliveryFormat: WhtDeliveryFormat
  filingForm: WhtFilingForm
  incomeType: string
  paymentDate: Date
  grossSatang: number
  whtSatang: number
  /** วันที่ออกหนังสือรับรอง (`wht_certificates.created_at`) */
  issuedAt: Date
  /** ชนิดผู้ถูกหัก (snapshot) — ตัดสินแถวเงินได้/การพิมพ์สาขา */
  payeeType: PayeeType
  /** snapshot `payout_batch_items.wht_income_category` — `null` = รอบเก่า (40(8)) */
  incomeCategory: WhtIncomeCategory | null
  /** เงื่อนไขการหัก (snapshot) */
  whtCondition: WhtCondition
  /** ลำดับที่ในแบบ ภ.ง.ด. ของงวด (`filingSequenceNumber()`) — `null` = คำนวณไม่ได้ (พิมพ์ "—") */
  filingSequence: number | null
  /** ใบแบบต่อผู้รับต่อรอบจ่าย — แสดงว่าเป็นยอดรวมของรอบไหนกี่รายการ (`null` = ใบต่อรายการ) */
  coverage?: { payoutBatchName: string; itemCount: number } | null
  /** ผู้มีหน้าที่หักภาษี ณ ที่จ่าย = องค์กร (snapshot) */
  payer: WhtCertificateParty
  /** ผู้ถูกหักภาษี ณ ที่จ่าย = payee (snapshot) */
  payee: WhtCertificateParty
  /**
   * ผู้มีอำนาจลงนามฝั่งผู้จ่ายเงิน ณ วันออกใบ (มติ PO U151 — `wht_certificates.payer_signer_*`)
   * ไม่ส่ง/`null` = ใบก่อน U151 หรือองค์กรยังไม่กรอก ⇒ เว้นจุดให้เขียนเอง (ไม่ดึงค่าปัจจุบัน)
   */
  payerSigner?: { name: string | null; title: string | null } | null
}

export interface WhtCertificateCopy {
  label: string
  purpose: string
}

/** 2 ฉบับในไฟล์เดียวตามแบบทางการ — ข้อความตามแบบของกรมสรรพากร */
export const WHT_CERTIFICATE_COPIES: readonly WhtCertificateCopy[] = [
  { label: 'ฉบับที่ 1', purpose: '(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)' },
  { label: 'ฉบับที่ 2', purpose: '(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)' },
]

export interface WhtCertificateIncomeLine {
  no: WhtFormIncomeRow
  label: string
  /** ใส่เฉพาะแถวที่ยอดของใบนี้ลง — แถวอื่นว่าง */
  dateText: string
  grossText: string
  whtText: string
  /** ข้อความประเภทเงินได้ที่ snapshot ไว้ (พิมพ์ใต้แถวที่มียอด) */
  detail: string | null
}

export interface WhtCertificateBox {
  label: string
  checked: boolean
}

/** เอกสารที่ประกอบเป็นข้อความครบแล้ว — component PDF ห้าม format/คำนวณซ้ำ (Rule 01) */
export interface WhtCertificateDoc {
  title: string
  titleEn: string
  legalNote: string
  certificateNumber: string
  statusLabel: string
  isCancelled: boolean
  cancelNote: string | null
  replacesNote: string | null
  /** ใบต่อรอบ: "ยอดรวมทุกรายการของผู้รับในรอบจ่าย … (n รายการ)" · ใบต่อรายการ = null */
  coverageNote: string | null
  deliveryFormatLabel: string
  filingFormLabel: string
  filingForm: WhtFilingForm
  incomeType: string
  paymentDateLabel: string
  payer: WhtCertificateParty
  payee: WhtCertificateParty
  grossText: string
  whtText: string
  whtInWordsText: string
  netText: string
  fileName: string
  /** ฉบับที่ 1 / ฉบับที่ 2 — 1 หน้าต่อฉบับ */
  copies: readonly WhtCertificateCopy[]
  /** "ลำดับที่ … ในแบบ" */
  filingSequenceText: string
  filingBoxes: readonly WhtCertificateBox[]
  incomeLines: readonly WhtCertificateIncomeLine[]
  conditionBoxes: readonly WhtCertificateBox[]
  /** วัน เดือน ปี ที่ออกหนังสือรับรอง (พ.ศ.) */
  issueDateLabel: string
  /** ชื่อ/ตำแหน่งผู้ลงนามฝั่งผู้จ่ายเงิน (มติ PO U151) — `null` = เว้นจุด */
  payerSignerName: string | null
  payerSignerTitle: string | null
}

/** ค่าที่ยังไม่มีในโปรไฟล์ตอนออกใบ พิมพ์เป็นขีดกลาง ห้ามเว้นว่างบนเอกสารทางการ */
export const EMPTY_FIELD_TEXT = '—'

/** ป้ายสาขาบนใบ — นิติบุคคลเท่านั้น (บุคคลธรรมดาไม่มีสาขา) */
export function whtPartyBranchLabel(branchCode: string | null, payeeType: PayeeType = 'corporate'): string | null {
  if (payeeType !== 'corporate' || branchCode === null) return null
  return formatBranch(branchCode)
}

function textOrNull(value: string | null): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

export function buildWhtCertificateDoc(source: WhtCertificateDocSource): WhtCertificateDoc {
  const isCancelled = source.status === 'cancelled'
  const paymentDateLabel = fmtDate(source.paymentDate)
  const grossText = fmtSatang(source.grossSatang)
  const whtText = fmtSatang(source.whtSatang)
  const filedBox = officialFilingBoxOf(source.filingForm)
  const incomeRow = officialIncomeRowOf({ incomeCategory: source.incomeCategory, payeeType: source.payeeType })

  return {
    title: WHT_CERTIFICATE_TITLE,
    titleEn: WHT_CERTIFICATE_TITLE_EN,
    legalNote: WHT_CERTIFICATE_LEGAL_NOTE,
    certificateNumber: source.certificateNumber,
    statusLabel: WHT_CERTIFICATE_STATUS_LABEL[source.status],
    isCancelled,
    cancelNote: isCancelled
      ? `ยกเลิกเมื่อ ${fmtDate(source.cancelledAt)} — ${(source.cancelReason ?? '').trim() || 'ไม่ระบุเหตุผล'}`
      : null,
    replacesNote:
      source.replacesCertificateNumber === null
        ? null
        : `ออกแทนหนังสือรับรองเลขที่ ${source.replacesCertificateNumber} ที่ถูกยกเลิก`,
    coverageNote:
      source.coverage === undefined || source.coverage === null
        ? null
        : `ยอดรวมทุกรายการของผู้รับในรอบจ่าย "${source.coverage.payoutBatchName}" (${source.coverage.itemCount} รายการ)`,
    deliveryFormatLabel: WHT_DELIVERY_FORMAT_LABEL[source.deliveryFormat],
    filingFormLabel: WHT_FILING_FORM_LABEL[source.filingForm],
    filingForm: source.filingForm,
    incomeType: source.incomeType,
    paymentDateLabel,
    payer: source.payer,
    payee: source.payee,
    grossText,
    whtText,
    whtInWordsText: bahtInWords(source.whtSatang),
    netText: fmtSatang(source.grossSatang - source.whtSatang),
    fileName: `${source.certificateNumber}.pdf`,
    copies: WHT_CERTIFICATE_COPIES,
    filingSequenceText: source.filingSequence === null ? EMPTY_FIELD_TEXT : String(source.filingSequence),
    filingBoxes: WHT_FORM_FILING_BOXES.map((box) => ({ label: box.label, checked: box.key === filedBox })),
    incomeLines: WHT_FORM_INCOME_ROWS.map((row) =>
      row.no === incomeRow
        ? { no: row.no, label: row.label, dateText: paymentDateLabel, grossText, whtText, detail: source.incomeType }
        : { no: row.no, label: row.label, dateText: '', grossText: '', whtText: '', detail: null },
    ),
    conditionBoxes: WHT_FORM_CONDITION_BOXES.map((box) => ({
      label: box.label,
      checked: box.key === source.whtCondition,
    })),
    issueDateLabel: fmtDate(source.issuedAt),
    payerSignerName: textOrNull(source.payerSigner?.name ?? null),
    payerSignerTitle: textOrNull(source.payerSigner?.title ?? null),
  }
}
