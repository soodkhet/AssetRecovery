import type { PayeeType, WhtCondition } from '@/lib/generated/prisma/enums'
import { formatThaiAddressLine } from '@/lib/address/address-value'
import { isValidTaxId, normalizeTaxId } from '@/lib/finance-companies/company'
import { HEAD_OFFICE_BRANCH_CODE } from '@/lib/format/branch'
import { PayeeError } from '@/lib/payees/errors'

/**
 * ผู้รับเงิน (Payee Profile) — **pure ล้วน ใช้ร่วม FE/BE** (ไฟล์ 18)
 *
 * กติกาที่ไฟล์นี้เป็นเจ้าของ:
 * - **auto-reset เป็น unverified เมื่อแก้ข้อมูลธนาคาร/ภาษี** (`18` §9 · `23` §6.2) — กันแก้ข้อมูล
 *   ผิดแล้วเงินออกผิดบัญชีโดยไม่มีใครตรวจซ้ำ
 * - **ความพร้อมก่อนยืนยัน** (`18` §9/§10) รวม policy `require_payee_id_document` (`13` §6.2.1)
 * - **`BANK_ACCOUNT_NAME_MISMATCH` = เตือน ไม่ block** (`18` §11 · Rule 04) — คืนผลเทียบชื่อให้
 *   ผู้เรียกตัดสินใจ ห้าม throw
 *
 * ⚠️ อัตรา WHT **ไม่ได้อยู่ที่นี่** — กฎ "Payee ชนะ Plan" มีบ้านเดียวคือ
 * `lib/finance/wht-calc.ts` (`22` §6.9 · `18` §6.3) ห้ามเขียนซ้ำ
 * ⚠️ ตัวตรวจเลข 13 หลักใช้ซ้ำจาก `lib/finance-companies/company.ts` (ไฟล์ 18 §7.1 ใช้รูปแบบเดียวกัน
 * — ตรวจแค่รูปแบบ ไม่ทำ checksum)
 */

export interface PayeeValues {
  payeeType: PayeeType
  taxProfileId: string | null
  nationalId: string | null
  bankName: string | null
  accountName: string | null
  accountNumber: string | null
  idDocumentUrl: string | null
  /**
   * อัตราหัก 40(2) ต่อคน (%) — สำนักงานบัญชีคำนวณให้ ระบบไม่คิดอัตราก้าวหน้า (มติ PO 05/10/2569 UAT U7)
   * `null` = ยังไม่กรอก · ใช้เมื่อค่าตั้งภาษีจัดผู้รับเป็นเงินได้ 40(2) เท่านั้น
   */
  wht402Pct: number | null
  /** คำนำหน้าชื่อ (บุคคลธรรมดา) — มติ PO U94 ข้อ 1 · นิติบุคคลไม่ใช้ */
  nameTitle: string | null
  /** ที่อยู่ผู้ถูกหักภาษี 5 ช่อง (โครงเดียวกับที่อยู่ของเคส) — บังคับครบก่อนยืนยัน (มติ PO U94 ข้อ 1) */
  addressDetail: string | null
  addressSubdistrict: string | null
  addressDistrict: string | null
  addressProvince: string | null
  addressPostalCode: string | null
  /** สำนักงานใหญ่ `00000` / สาขา 5 หลัก — ใช้เฉพาะนิติบุคคล (บุคคลธรรมดา normalize เป็น `00000`) */
  branchCode: string
  /** เงื่อนไขการหัก (1)/(2)/(3) — บันทึก/พิมพ์บนใบ 50 ทวิ เท่านั้น ไม่เปลี่ยนสูตร */
  whtCondition: WhtCondition
}

// ── คำนำหน้า / เงื่อนไขการหัก (มติ PO 06/10/2569 UAT U94 ข้อ 1) ────────────────

/** ตัวเลือกคำนำหน้าบนฟอร์ม — "อื่น ๆ" ให้พิมพ์เอง (เก็บเป็นข้อความที่พิมพ์บนเอกสาร) */
export const PAYEE_NAME_TITLE_OPTIONS = ['นาย', 'นาง', 'นางสาว'] as const

export type PayeeNameTitleChoice = (typeof PAYEE_NAME_TITLE_OPTIONS)[number] | 'other' | ''

/** ค่าที่เก็บ → ตัวเลือกบนฟอร์ม (ข้อความที่ไม่อยู่ในรายการ = "อื่น ๆ") */
export function nameTitleChoiceOf(title: string | null): PayeeNameTitleChoice {
  const trimmed = (title ?? '').trim()
  if (trimmed === '') return ''
  return (PAYEE_NAME_TITLE_OPTIONS as readonly string[]).includes(trimmed)
    ? (trimmed as PayeeNameTitleChoice)
    : 'other'
}

/** ตัวเลือกบนฟอร์ม → ข้อความที่ส่ง API (`''` = ไม่ระบุ) */
export function nameTitleFromForm(choice: PayeeNameTitleChoice, other: string): string {
  if (choice === 'other') return other.trim()
  return choice
}

/**
 * ช่องที่อยู่ที่ต้องครบก่อน "ยืนยัน" — ชุดเดียวที่ FE (ดอกจันบน `AddressFields`) และ BE
 * (`missingFieldsForVerification()`) ใช้ร่วมกัน (มติ PO U94 ข้อ 1)
 */
export const PAYEE_REQUIRED_ADDRESS_FIELDS = [
  'detail',
  'postalCode',
  'province',
  'district',
  'subdistrict',
] as const

/** ค่าตรง enum `wht_condition` ของ `02` §3 — เรียงตามช่อง "ผู้จ่ายเงิน" บนแบบ 50 ทวิ */
export const WHT_CONDITIONS = ['withhold', 'pay_always', 'pay_once'] as const satisfies readonly WhtCondition[]

export const WHT_CONDITION_LABEL: Readonly<Record<WhtCondition, string>> = {
  withhold: '(1) หัก ณ ที่จ่าย',
  pay_always: '(2) ออกให้ตลอดไป',
  pay_once: '(3) ออกให้ครั้งเดียว',
}

/**
 * ⚠️ ระบบคำนวณภาษีแบบ (1) หัก ณ ที่จ่ายเสมอ — (2)/(3) ผู้จ่ายออกภาษีให้ ⇒ ฐานภาษีต้องคำนวณแบบทบยอด
 * (gross-up) ซึ่งเป็นงานของสำนักงานบัญชี (Hybrid Boundary) · ระบบรองรับแค่บันทึก + พิมพ์บนใบ 50 ทวิ
 */
export function whtConditionAffectsFormula(condition: WhtCondition): boolean {
  return condition !== 'withhold'
}

/** ชื่อเต็มบนเอกสาร — บุคคลธรรมดาต่อคำนำหน้า (ถ้ามี) · นิติบุคคลใช้ชื่อตามจริง */
export function payeeDisplayName(input: { name: string; nameTitle: string | null; payeeType: PayeeType }): string {
  const title = (input.nameTitle ?? '').trim()
  if (input.payeeType === 'corporate' || title === '') return input.name
  return input.name.startsWith(title) ? input.name : `${title}${input.name}`
}

/** ที่อยู่ของผู้รับเป็นบรรทัดเดียว (สำหรับ snapshot ใบ 50 ทวิ / ไฟล์ส่งบัญชี) — ว่างทั้งชุด = `null` */
export function payeeAddressLine(values: Pick<
  PayeeValues,
  'addressDetail' | 'addressSubdistrict' | 'addressDistrict' | 'addressProvince' | 'addressPostalCode'
>): string | null {
  return formatThaiAddressLine({
    detail: values.addressDetail,
    subdistrict: values.addressSubdistrict,
    district: values.addressDistrict,
    province: values.addressProvince,
    postalCode: values.addressPostalCode,
  })
}

/**
 * ฟิลด์ที่ "แก้แล้วต้องยืนยันใหม่" (`18` §9 — ข้อมูลธนาคาร/ภาษี)
 *
 * `payee_type` นับด้วยเพราะเป็นตัวกำหนดว่าเลข 13 หลักคือบัตรประชาชนหรือทะเบียนนิติบุคคล และผูกกับ
 * แบบนำส่ง WHT (ภ.ง.ด.3 / ภ.ง.ด.53 — `33` §6.1) ⇒ กระทบภาษีโดยตรง
 * `id_document_url` **ไม่นับ** — เป็นหลักฐานประกอบการยืนยัน ไม่ใช่ปลายทางของเงิน
 */
export const PAYEE_VERIFICATION_RESET_FIELDS = [
  'payeeType',
  'taxProfileId',
  'nationalId',
  'bankName',
  'accountName',
  'accountNumber',
  // อัตราหัก 40(2) กระทบยอดภาษีที่หักโดยตรง (มติ PO 05/10/2569 UAT U7)
  'wht402Pct',
  // ข้อมูลผู้ถูกหักที่พิมพ์บนใบ 50 ทวิ (มติ PO U94 ข้อ 1) — แก้แล้วต้องมีคนตรวจซ้ำก่อนออกใบรอบถัดไป
  'nameTitle',
  'addressDetail',
  'addressSubdistrict',
  'addressDistrict',
  'addressProvince',
  'addressPostalCode',
  'branchCode',
  'whtCondition',
] as const satisfies readonly (keyof PayeeValues)[]

export type PayeeVerificationResetField = (typeof PAYEE_VERIFICATION_RESET_FIELDS)[number]

const trimOrNull = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/** เลขบัญชีเก็บเฉพาะตัวเลข — ขีด/ช่องว่างเป็นแค่การแสดงผล (กันเลขเดียวกันเข้าคนละรูปแบบ) */
export function normalizeAccountNumber(value: string | null | undefined): string | null {
  const trimmed = trimOrNull(value)
  if (trimmed === null) return null
  const digits = trimmed.replace(/[\s-]/g, '')
  return digits === '' ? null : digits
}

export function normalizePayeeValues(values: PayeeValues): PayeeValues {
  const nationalId = trimOrNull(values.nationalId)
  return {
    payeeType: values.payeeType,
    taxProfileId: trimOrNull(values.taxProfileId),
    nationalId: nationalId === null ? null : normalizeTaxId(nationalId),
    bankName: trimOrNull(values.bankName),
    accountName: trimOrNull(values.accountName),
    accountNumber: normalizeAccountNumber(values.accountNumber),
    idDocumentUrl: trimOrNull(values.idDocumentUrl),
    wht402Pct: values.wht402Pct ?? null,
    nameTitle: values.payeeType === 'corporate' ? null : trimOrNull(values.nameTitle),
    addressDetail: trimOrNull(values.addressDetail),
    addressSubdistrict: trimOrNull(values.addressSubdistrict),
    addressDistrict: trimOrNull(values.addressDistrict),
    addressProvince: trimOrNull(values.addressProvince),
    addressPostalCode: trimOrNull(values.addressPostalCode),
    // บุคคลธรรมดาไม่มีสาขา — เก็บเป็นสำนักงานใหญ่ให้คอลัมน์ NOT NULL และไม่พิมพ์บนเอกสาร
    branchCode: values.payeeType === 'corporate' ? (trimOrNull(values.branchCode) ?? HEAD_OFFICE_BRANCH_CODE) : HEAD_OFFICE_BRANCH_CODE,
    whtCondition: values.whtCondition,
  }
}

/** `18` §7.1 — ตรวจแค่รูปแบบ 13 หลัก (ไม่มี checksum) · ว่างได้ตอนสร้าง ตรวจเข้มตอนยืนยัน */
export function assertPayeeNationalId(value: string | null): string | null {
  if (value === null) return null
  if (!isValidTaxId(value)) {
    throw new PayeeError('INVALID_TAX_ID_FORMAT', { detail: `national_id=${value}` })
  }
  return normalizeTaxId(value)
}

/** ฟิลด์อ่อนไหวที่เปลี่ยนจริงระหว่างค่าเดิม/ค่าใหม่ (normalize แล้วทั้งคู่) */
export function changedVerificationFields(
  before: PayeeValues,
  after: PayeeValues,
): PayeeVerificationResetField[] {
  const from = normalizePayeeValues(before)
  const to = normalizePayeeValues(after)
  return PAYEE_VERIFICATION_RESET_FIELDS.filter((field) => from[field] !== to[field])
}

/**
 * `18` §9 · `23` §6.2 — verified + แก้ธนาคาร/ภาษี ⇒ กลับเป็น unverified อัตโนมัติ
 * (payee ที่ยัง unverified อยู่แล้วไม่มีอะไรให้ reset)
 */
export function shouldResetVerification(input: {
  isVerified: boolean
  before: PayeeValues
  after: PayeeValues
}): boolean {
  return input.isVerified && changedVerificationFields(input.before, input.after).length > 0
}

/** เทียบชื่อแบบไม่สนช่องว่าง/ตัวพิมพ์/คำนำหน้าที่ไม่กระทบตัวตน — ใช้เฉพาะการ "เตือน" เท่านั้น */
function foldName(value: string): string {
  return value
    .replace(/^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*/i, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export interface BankAccountNameCheck {
  /** true = ชื่อบัญชีตรงกับชื่อผู้รับเงิน (หรือยังกรอกไม่ครบจนเทียบไม่ได้) */
  matches: boolean
  payeeName: string
  accountName: string
}

/**
 * `18` §7.1/§11 `BANK_ACCOUNT_NAME_MISMATCH` — **เตือน ไม่ reject**
 * (บางกรณีตรงจริงแต่เขียนคนละรูปแบบ ให้การเงินตรวจก่อนยืนยัน)
 *
 * ยังกรอกชื่อบัญชีไม่ครบ = ไม่เตือน (ปล่อยให้ `REQUIRED_MISSING` ตอนยืนยันจัดการแทน)
 */
export function checkBankAccountName(payeeName: string, accountName: string | null): BankAccountNameCheck {
  const account = trimOrNull(accountName)
  if (account === null) return { matches: true, payeeName, accountName: '' }
  return { matches: foldName(payeeName) === foldName(account), payeeName, accountName: account }
}

/**
 * ฟิลด์ที่ต้องครบก่อนกด "ยืนยัน" (`18` §9 — พร้อมเข้ารอบจ่ายเงินของไฟล์ 17)
 * + ที่อยู่ผู้ถูกหักภาษีครบ 5 ช่อง (มติ PO U94 ข้อ 1 — ใบ 50 ทวิ ต้องมีที่อยู่ตาม ม.50 ทวิ)
 */
export const REQUIRED_FOR_VERIFY = [
  'taxProfileId',
  'nationalId',
  'bankName',
  'accountName',
  'accountNumber',
  'addressDetail',
  'addressSubdistrict',
  'addressDistrict',
  'addressProvince',
  'addressPostalCode',
] as const satisfies readonly (keyof PayeeValues)[]

export function missingFieldsForVerification(values: PayeeValues): string[] {
  const normalized = normalizePayeeValues(values)
  return REQUIRED_FOR_VERIFY.filter((field) => normalized[field] === null)
}

/**
 * `18` §9/§10 — เกตก่อนตั้ง `is_verified = true`
 * @param requireIdDocument `finance_policy_settings.require_payee_id_document` (`13` §6.2.1)
 */
export function assertPayeeReadyForVerification(input: {
  values: PayeeValues
  requireIdDocument: boolean
}): void {
  const missing = missingFieldsForVerification(input.values)
  if (missing.length > 0) {
    throw new PayeeError('REQUIRED_MISSING', {
      detail: `missing=${missing.join(',')}`,
      context: { fields: missing },
    })
  }
  assertPayeeNationalId(normalizePayeeValues(input.values).nationalId)
  if (input.requireIdDocument && normalizePayeeValues(input.values).idDocumentUrl === null) {
    throw new PayeeError('PAYEE_ID_DOCUMENT_REQUIRED')
  }
}

/** แสดงเลขบัญชีแบบปิดบัง 4 ตัวท้าย — ใช้กับผู้ที่มีสิทธิ์ `view` (ไม่ใช่ `manage`) */
export function maskAccountNumber(value: string | null): string | null {
  const normalized = normalizeAccountNumber(value)
  if (normalized === null) return null
  if (normalized.length <= 4) return normalized
  return `${'•'.repeat(normalized.length - 4)}${normalized.slice(-4)}`
}

/** payload ที่ลง audit — ชื่อคอลัมน์ snake_case ตามตารางจริง (`90` §13 · `18` §13) */
export function toPayeeAuditPayload(values: PayeeValues): Record<string, unknown> {
  const normalized = normalizePayeeValues(values)
  return {
    payee_type: normalized.payeeType,
    tax_profile_id: normalized.taxProfileId,
    national_id: normalized.nationalId,
    bank_name: normalized.bankName,
    account_name: normalized.accountName,
    account_number: normalized.accountNumber,
    id_document_url: normalized.idDocumentUrl,
    wht_40_2_pct: normalized.wht402Pct,
    name_title: normalized.nameTitle,
    address_detail: normalized.addressDetail,
    address_subdistrict: normalized.addressSubdistrict,
    address_district: normalized.addressDistrict,
    address_province: normalized.addressProvince,
    address_postal_code: normalized.addressPostalCode,
    branch_code: normalized.branchCode,
    wht_condition: normalized.whtCondition,
  }
}
